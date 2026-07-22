import Graph from "graphology";
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
import type {
  CorpusEdge,
  CorpusGraph,
  CorpusNode,
} from "@/lib/graph/corpus-graph";
import { stableCoord } from "@/lib/graph/corpus-graph";
import { nodeIconUrl } from "@/lib/graph/node-icons";
import {
  GRAPH_CANVAS_BG,
  VOCAB_NODE_COLOR,
  VOCAB_NODE_SIZE,
} from "@/lib/graph/render-styles";
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
      color: VOCAB_NODE_COLOR,
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

function copyGraph(source: Graph): Graph {
  return source.copy();
}

function positionVocabNodeNearSource(
  graph: Graph,
  vocabId: string,
  sourceId: string,
): void {
  if (!graph.hasNode(sourceId)) {
    graph.setNodeAttribute(vocabId, "x", stableCoord(vocabId, 0));
    graph.setNodeAttribute(vocabId, "y", stableCoord(vocabId, 1));
    return;
  }

  const source = graph.getNodeAttributes(sourceId);
  const sx = (source.x as number) ?? 0;
  const sy = (source.y as number) ?? 0;
  const angle = stableCoord(vocabId, 0) * Math.PI * 2;
  const dist = 0.65 + (stableCoord(vocabId, 1) * 0.5 + 0.5) * 0.35;

  graph.setNodeAttribute(vocabId, "x", sx + dist * Math.cos(angle));
  graph.setNodeAttribute(vocabId, "y", sy + dist * Math.sin(angle));
}

/** Merge an optional vocab layer onto a copy of the corpus graph for display. */
export function buildDisplayGraph(
  corpus: CorpusGraph,
  bundle: ExplorerBundle,
  visibleObjectIds: Set<string>,
  showVocabNodes: boolean,
  vocabIndex: VocabIndex,
): Graph {
  if (!showVocabNodes || visibleObjectIds.size === 0) {
    return corpus.graphology;
  }

  const layer = buildVocabGraphLayer(bundle, visibleObjectIds, vocabIndex);
  if (layer.nodes.length === 0) {
    return corpus.graphology;
  }

  const graph = copyGraph(corpus.graphology);

  for (const node of layer.nodes) {
    if (graph.hasNode(node.id)) continue;
    graph.addNode(node.id, {
      label: node.label,
      type: "image",
      objectType: "vocab",
      vocabBucket: node.vocabBucket,
      color: GRAPH_CANVAS_BG,
      size: node.size,
      image: nodeIconUrl("vocab"),
      x: stableCoord(node.id, 0),
      y: stableCoord(node.id, 1),
    });
  }

  for (const edge of layer.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    if (graph.hasEdge(edge.id)) continue;

    positionVocabNodeNearSource(graph, edge.target, edge.source);

    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      label: edge.label,
      kind: edge.kind,
      type: "curvedArrow",
      size: 0.75,
      color: "#a78bfa66",
    });
  }

  return graph;
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
