import { normalizeExplorerBundle } from "@/lib/data/catalog";
import {
  buildCorpusGraph,
  inEdges,
  outEdges,
  type CorpusGraph,
} from "@/lib/graph/corpus-graph";
import { resolveObjectTechniques } from "@/lib/graph/attack-mapping";
import { getThreatKillchain } from "@/lib/graph/killchain-grouping";
import { enrichBundle } from "@/lib/opentide/enrich-bundle";
import { createGraphContext, type GraphContext } from "@/lib/opentide/graph";
import {
  OBJECT_TYPES,
  type BundleObjectSummary,
  type ExplorerBundle,
  type ObjectType,
  type RawExplorerBundle,
} from "@/lib/opentide/types";
import { lookupVocabTerm, type VocabIndex } from "@/lib/opentide/vocab";
import {
  buildSearchDocuments,
  createSearchIndex,
  type SearchIndex,
} from "@/lib/search/engine";
import {
  buildTokenVocabulary,
  enrichTokenVocabulary,
  type TokenVocabulary,
} from "@/lib/search/token-catalog";

/** Everything the explorer derives once from the bundle and vocabulary. */
export interface Catalog {
  bundle: ExplorerBundle;
  vocab: VocabIndex;
  graph: GraphContext;
  corpus: CorpusGraph;
  search: SearchIndex;
  tokens: TokenVocabulary;
  summaries: Map<string, BundleObjectSummary>;
  /** Summaries per type, by name. */
  byType: Record<ObjectType, BundleObjectSummary[]>;
  overview: CatalogOverview;
}

export interface CatalogOverview {
  counts: Record<ObjectType, number>;
  /** Threats an objective names. */
  coveredThreats: number;
  /** Threats with a rule somewhere down their detection chain. */
  threatsWithRules: number;
  techniques: { mapped: number; detected: number };
  platforms: Array<{ name: string; rules: number; production: number }>;
  killchain: Array<{ stage: string; count: number }>;
  chainingLinks: number;
  mostChained: Array<{ id: string; name: string; degree: number }>;
}

function emptyByType<T>(make: () => T): Record<ObjectType, T> {
  return {
    threat: make(),
    objective: make(),
    signal: make(),
    rule: make(),
  };
}

/** Does a rule sit anywhere downstream of this node on the detection chain? */
function reachesRule(corpus: CorpusGraph, start: string): boolean {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.pop()!;
    for (const edge of outEdges(corpus, id)) {
      if (edge.kind !== "detection" || seen.has(edge.target)) continue;
      if (corpus.nodeById.get(edge.target)?.type === "rule") return true;
      seen.add(edge.target);
      queue.push(edge.target);
    }
  }
  return false;
}

function buildOverview(
  bundle: ExplorerBundle,
  corpus: CorpusGraph,
  byType: Record<ObjectType, BundleObjectSummary[]>,
): CatalogOverview {
  const counts = emptyByType(() => 0);
  for (const type of OBJECT_TYPES) counts[type] = byType[type].length;

  let coveredThreats = 0;
  let threatsWithRules = 0;
  const killchain = new Map<string, number>();
  for (const threat of byType.threat) {
    const covered = outEdges(corpus, threat.uuid).some(
      (edge) =>
        edge.kind === "detection" &&
        corpus.nodeById.get(edge.target)?.type === "objective",
    );
    if (covered) coveredThreats += 1;
    if (covered && reachesRule(corpus, threat.uuid)) threatsWithRules += 1;
    const stage = getThreatKillchain(bundle.flatIndex[threat.uuid]);
    if (stage) killchain.set(stage, (killchain.get(stage) ?? 0) + 1);
  }

  const mapped = new Set<string>();
  const detected = new Set<string>();
  for (const summary of bundle.summaries) {
    for (const technique of summary.techniques) {
      if (summary.type === "threat") mapped.add(technique);
      else detected.add(technique);
    }
  }

  const platforms = new Map<string, { rules: number; production: number }>();
  for (const [, deployments] of Object.entries(
    bundle.stagingIndex?.deployments ?? {},
  )) {
    for (const [platform, status] of Object.entries(deployments)) {
      const entry = platforms.get(platform) ?? { rules: 0, production: 0 };
      entry.rules += 1;
      if (status === "PRODUCTION") entry.production += 1;
      platforms.set(platform, entry);
    }
  }

  let chainingLinks = 0;
  const degree = new Map<string, number>();
  for (const edge of corpus.edges) {
    if (edge.kind !== "chaining") continue;
    chainingLinks += 1;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  return {
    counts,
    coveredThreats,
    threatsWithRules,
    techniques: { mapped: mapped.size, detected: detected.size },
    platforms: [...platforms.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .toSorted((a, b) => b.rules - a.rules || a.name.localeCompare(b.name)),
    killchain: [...killchain.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .toSorted((a, b) => b.count - a.count || a.stage.localeCompare(b.stage)),
    chainingLinks,
    mostChained: [...degree.entries()]
      .map(([id, value]) => ({
        id,
        name: corpus.nodeById.get(id)?.label ?? id,
        degree: value,
      }))
      .toSorted((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}

export function buildCatalog(
  raw: RawExplorerBundle | ExplorerBundle,
  vocab: VocabIndex,
): Catalog {
  const bundle = enrichBundle(normalizeExplorerBundle(raw));
  const graph = createGraphContext(bundle);
  const corpus = buildCorpusGraph(bundle);
  const summaries = new Map(bundle.summaries.map((s) => [s.uuid, s]));

  const byType = emptyByType<BundleObjectSummary[]>(() => []);
  for (const summary of bundle.summaries) byType[summary.type]?.push(summary);
  for (const type of OBJECT_TYPES) {
    byType[type].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    bundle,
    vocab,
    graph,
    corpus,
    search: createSearchIndex(
      buildSearchDocuments(bundle, (summary) =>
        resolveObjectTechniques(graph, summary),
      ),
    ),
    tokens: enrichTokenVocabulary(buildTokenVocabulary(bundle), vocab),
    summaries,
    byType,
    overview: buildOverview(bundle, corpus, byType),
  };
}

/** ATT&CK technique display name from the vocabulary, or the id. */
export function techniqueName(vocab: VocabIndex, id: string): string {
  const term = lookupVocabTerm(vocab, "att&ck", id);
  if (!term) return id;
  return term.name
    .replace(/^\[(Enterprise|ICS|Mobile)\]\s+/, "")
    .replace(/^(Industrial|Mobile|Enterprise)\s*:\s+/, "");
}

export function techniqueUrl(id: string): string {
  return `https://attack.mitre.org/techniques/${id.replace(".", "/")}/`;
}

/** Number of detection links touching a node, both directions. */
export function detectionDegree(corpus: CorpusGraph, id: string): number {
  let count = 0;
  for (const edge of outEdges(corpus, id))
    if (edge.kind === "detection") count += 1;
  for (const edge of inEdges(corpus, id))
    if (edge.kind === "detection") count += 1;
  return count;
}
