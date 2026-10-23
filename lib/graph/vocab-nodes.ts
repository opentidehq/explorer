import type Graph from "graphology";
import {
  FIELD_REGISTRY,
  resolveFieldValue,
  type FieldDefinition,
} from "@/lib/opentide/field-registry";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  ObjectBody,
  ObjectType,
} from "@/lib/opentide/types";
import type { CorpusEdge, CorpusNode } from "@/lib/graph/corpus-graph";
import { stableCoord } from "@/lib/graph/corpus-graph";
import { VOCAB_NODE_SIZE } from "@/lib/graph/render-styles";
import { buildEnrichedBody } from "@/lib/opentide/metadata-fields";
import {
  findSurfaceTermsInText,
  formatVocabDisplayName,
  lookupVocabTerm,
  parseTerrainMarkdown,
  splitPillValues,
  type VocabIndex,
} from "@/lib/opentide/vocab";

const VOCAB_NODE_PREFIX = "vocab::";

export type VocabGraphNodeType = "vocab";

export interface VocabReference {
  bucket: string;
  term: string;
  fieldLabel: string;
}

export interface VocabGraphNode extends Omit<CorpusNode, "type"> {
  type: VocabGraphNodeType;
  vocabBucket: string;
}

export function vocabNodeId(bucket: string, term: string): string {
  return `${VOCAB_NODE_PREFIX}${bucket}::${term}`;
}

export function isVocabNodeId(id: string): boolean {
  return id.startsWith(VOCAB_NODE_PREFIX);
}

function pillValuesForField(
  field: FieldDefinition,
  value: unknown,
  vocabIndex: VocabIndex,
): string[] {
  if (field.format === "surface" && Array.isArray(value)) {
    return splitPillValues(value);
  }
  if (field.format === "surface" && typeof value === "string") {
    const { scopes, inlinePaths } = parseTerrainMarkdown(value);
    const scoped = scopes.flatMap((scope) => scope.values);
    const matched = findSurfaceTermsInText(vocabIndex, value);
    return [...new Set([...scoped, ...inlinePaths, ...matched])];
  }

  if (field.format === "pills") {
    return splitPillValues(value);
  }

  return [];
}

/** Collect vocab term references from a single corpus object. */
export function collectObjectVocabReferences(
  summary: BundleObjectSummary,
  body: ObjectBody,
  vocabIndex: VocabIndex,
): VocabReference[] {
  const refs: VocabReference[] = [];
  const seen = new Set<string>();
  const enriched = buildEnrichedBody(summary, body);
  const fields = FIELD_REGISTRY[summary.type as ObjectType];

  for (const field of fields) {
    if (!field.vocab) continue;
    if (field.format === "attack" || field.format === "references") continue;

    const value = resolveFieldValue(enriched, field.path);
    if (value == null || value === "") continue;

    for (const raw of pillValuesForField(field, value, vocabIndex)) {
      const term = lookupVocabTerm(vocabIndex, field.vocab, raw);
      const canonical = term ? term.name : raw.trim();
      if (!canonical) continue;

      const key = `${field.vocab}\0${canonical}`;
      if (seen.has(key)) continue;
      seen.add(key);

      refs.push({
        bucket: field.vocab,
        term: canonical,
        fieldLabel: field.label,
      });
    }
  }

  return refs;
}

export interface VocabGraphLayer {
  nodes: VocabGraphNode[];
  edges: CorpusEdge[];
}

/** Build vocab nodes and object→vocab edges for the given visible object ids only. */
export function buildVocabGraphLayer(
  bundle: ExplorerBundle,
  objectIds: Iterable<string>,
  vocabIndex: VocabIndex,
): VocabGraphLayer {
  const summaryById = new Map(bundle.summaries.map((s) => [s.uuid, s]));
  const nodes = new Map<string, VocabGraphNode>();
  const edges: CorpusEdge[] = [];
  const edgeByPair = new Map<string, number>();

  function ensureVocabNode(bucket: string, term: string) {
    const id = vocabNodeId(bucket, term);
    if (nodes.has(id)) return id;

    const vocabTerm = lookupVocabTerm(vocabIndex, bucket, term);
    const label = vocabTerm
      ? formatVocabDisplayName(vocabTerm.name)
      : formatVocabDisplayName(term);

    nodes.set(id, {
      id,
      label,
      type: "vocab",
      vocabBucket: bucket,
      size: VOCAB_NODE_SIZE,
    });
    return id;
  }

  function addEdge(source: string, target: string, label: string) {
    const pairKey = `${source}|${target}|vocab`;
    const existingIndex = edgeByPair.get(pairKey);
    if (existingIndex !== undefined) {
      const existing = edges[existingIndex]!;
      const labels = new Set(
        existing.label.split(", ").filter((part) => part.length > 0),
      );
      labels.add(label);
      existing.label = [...labels].join(", ");
      return;
    }

    edgeByPair.set(pairKey, edges.length);
    edges.push({
      id: pairKey,
      source,
      target,
      label,
      kind: "vocab",
    });
  }

  for (const objectId of objectIds) {
    const summary = summaryById.get(objectId);
    const body = bundle.flatIndex[objectId];
    if (!summary || !body) continue;

    for (const ref of collectObjectVocabReferences(summary, body, vocabIndex)) {
      const vocabId = ensureVocabNode(ref.bucket, ref.term);
      addEdge(objectId, vocabId, ref.fieldLabel);
    }
  }

  return { nodes: [...nodes.values()], edges };
}

/** Beside the object that names it: the same spot every time, in either layout. */
function placeNearSource(graph: Graph, vocabId: string, sourceId: string) {
  const source = graph.getNodeAttributes(sourceId);
  const angle = stableCoord(vocabId, 0) * Math.PI * 2;
  const dist = 0.65 + (stableCoord(vocabId, 1) * 0.5 + 0.5) * 0.35;
  const dx = dist * Math.cos(angle);
  const dy = dist * Math.sin(angle);
  const point: Record<string, number> = {
    x: ((source.x as number | undefined) ?? 0) + dx,
    y: ((source.y as number | undefined) ?? 0) + dy,
  };
  // Where it returns to when kill chain grouping ends.
  if (typeof source.baseX === "number" && typeof source.baseY === "number") {
    point.baseX = source.baseX + dx;
    point.baseY = source.baseY + dy;
  }
  graph.mergeNodeAttributes(vocabId, point);
}

/** Stale vocabulary items above which `syncVocabLayer` rebuilds the graph instead of dropping. */
const REBUILD_THRESHOLD = 50;

/**
 * Bring a graph's vocabulary nodes in line with a layer, in place: add what is missing beside
 * the object that names it, drop what the layer no longer has. Object nodes keep their
 * positions, so a layout survives the vocabulary being shown, searched and hidden.
 */
export function syncVocabLayer(graph: Graph, layer: VocabGraphLayer): void {
  const wantedNodes = new Set(layer.nodes.map((node) => node.id));
  const wantedEdges = new Set(layer.edges.map((edge) => edge.id));

  const staleNodes = new Set<string>();
  graph.forEachNode((node) => {
    if (isVocabNodeId(node) && !wantedNodes.has(node)) staleNodes.add(node);
  });
  const staleEdges = new Set<string>();
  graph.forEachEdge((edge, attrs, source, target) => {
    const stale =
      (attrs.kind === "vocab" && !wantedEdges.has(edge)) ||
      staleNodes.has(source) ||
      staleNodes.has(target);
    if (stale) staleEdges.add(edge);
  });

  // A renderer bound to the graph re-indexes all of it on every drop (sigma does), so
  // hiding thousands of vocabulary items one by one freezes the page. Past a few, rebuild
  // the graph in one clear and import: additions are cheap, drops are not.
  if (staleNodes.size + staleEdges.size > REBUILD_THRESHOLD) {
    const kept = graph.export();
    kept.nodes = kept.nodes.filter((node) => !staleNodes.has(node.key));
    kept.edges = kept.edges.filter(
      (edge) => edge.key === undefined || !staleEdges.has(edge.key),
    );
    graph.clear();
    graph.import(kept);
  } else {
    for (const edge of staleEdges) graph.dropEdge(edge);
    for (const node of staleNodes) graph.dropNode(node);
  }

  const added = new Set<string>();
  for (const node of layer.nodes) {
    if (graph.hasNode(node.id)) continue;
    graph.addNode(node.id, {
      label: node.label,
      objectType: "vocab",
      vocabBucket: node.vocabBucket,
      size: node.size,
      x: stableCoord(node.id, 0),
      y: stableCoord(node.id, 1),
    });
    added.add(node.id);
  }

  for (const edge of layer.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    if (added.delete(edge.target)) {
      placeNearSource(graph, edge.target, edge.source);
    }
    if (graph.hasEdge(edge.id)) continue;
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      label: edge.label,
      kind: edge.kind,
      size: 0.75,
    });
  }
}

/** Visible ids including vocab nodes linked to visible objects. */
export function expandVisibleIdsWithVocab(
  objectIds: Set<string>,
  layer: VocabGraphLayer,
): Set<string> {
  const expanded = new Set(objectIds);
  for (const edge of layer.edges) {
    if (objectIds.has(edge.source)) {
      expanded.add(edge.target);
    }
  }
  return expanded;
}
