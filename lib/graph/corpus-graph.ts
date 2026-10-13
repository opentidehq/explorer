import {
  chainResolver,
  childs,
  createGraphContext,
  getType,
  parents,
  ruleDetectionSources,
} from "@/lib/opentide/graph";
import type { ExplorerBundle, ObjectType } from "@/lib/opentide/types";

/**
 * The corpus as a graph: one node per object, detection edges down the ontology
 * (threat → objective → signal → rule) and chaining edges between threats.
 *
 * Plain data with adjacency indexes, so every view can traverse it without loading the
 * WebGL stack; the graph view turns it into a graphology instance (see graph-layout.ts).
 */

export type GraphEdgeKind = "detection" | "chaining" | "vocab";

export interface CorpusEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: GraphEdgeKind;
}

export interface CorpusNode {
  id: string;
  label: string;
  type: ObjectType;
  size: number;
}

export interface CorpusGraph {
  nodes: CorpusNode[];
  edges: CorpusEdge[];
  nodeById: Map<string, CorpusNode>;
  /** Edges leaving each node. */
  outgoing: Map<string, CorpusEdge[]>;
  /** Edges arriving at each node. */
  incoming: Map<string, CorpusEdge[]>;
}

export const NODE_SIZE: Record<ObjectType, number> = {
  threat: 7,
  objective: 11,
  signal: 7.5,
  rule: 9,
};

/** FNV-1a with a murmur3 finaliser: well-mixed 32 bits per (text, seed). */
function hash32(text: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministic pseudo-random coordinate in [-1, 1] for an id. Each axis hashes with its own
 * seed, so x and y are independent: seeds on a line would start a force layout degenerate.
 */
export function stableCoord(id: string, axis: number): number {
  return (hash32(id, Math.imul(axis + 1, 0x9e3779b9)) / 0xffffffff) * 2 - 1;
}

function shortenRelation(relation: string): string {
  const parts = relation.split("::");
  return parts[parts.length - 1] ?? relation;
}

const EMPTY: CorpusEdge[] = [];

function indexEdges(edges: CorpusEdge[]) {
  const outgoing = new Map<string, CorpusEdge[]>();
  const incoming = new Map<string, CorpusEdge[]>();
  for (const edge of edges) {
    const out = outgoing.get(edge.source);
    if (out) out.push(edge);
    else outgoing.set(edge.source, [edge]);
    const inc = incoming.get(edge.target);
    if (inc) inc.push(edge);
    else incoming.set(edge.target, [edge]);
  }
  return { outgoing, incoming };
}

export function buildCorpusGraph(bundle: ExplorerBundle): CorpusGraph {
  const ctx = createGraphContext(bundle);
  const summaryById = new Map(bundle.summaries.map((s) => [s.uuid, s]));
  const nodes = new Map<string, CorpusNode>();
  const edges: CorpusEdge[] = [];
  const edgeByPair = new Map<string, number>();

  function ensureNode(id: string) {
    if (nodes.has(id)) return;
    const summary = summaryById.get(id);
    const type = (summary?.type ??
      getType(ctx, id, true) ??
      "threat") as ObjectType;
    nodes.set(id, {
      id,
      label: summary?.name ?? id.slice(0, 8),
      type,
      size: NODE_SIZE[type],
    });
  }

  function addEdge(
    source: string,
    target: string,
    label: string,
    kind: GraphEdgeKind,
  ) {
    if (source === target) return;
    ensureNode(source);
    ensureNode(target);

    const pairKey = `${source}|${target}`;
    const existingIndex = edgeByPair.get(pairKey);
    if (existingIndex !== undefined) {
      const existing = edges[existingIndex]!;
      const labels = new Set(
        existing.label.split(", ").filter((part) => part.length > 0),
      );
      labels.add(label);
      existing.label = [...labels].join(", ");
      if (kind === "detection" && existing.kind === "chaining") {
        existing.kind = "detection";
      }
      return;
    }

    edgeByPair.set(pairKey, edges.length);
    edges.push({ id: pairKey, source, target, label, kind });
  }

  for (const summary of bundle.summaries) {
    ensureNode(summary.uuid);
    const type = summary.type;

    if (type === "objective") {
      for (const parent of parents(ctx, summary.uuid)) {
        addEdge(parent, summary.uuid, "objective", "detection");
      }
      for (const child of childs(ctx, summary.uuid)) {
        if (getType(ctx, child, true) === "signal") {
          addEdge(summary.uuid, child, "signal", "detection");
        }
      }
    }

    if (type === "signal") {
      for (const parent of parents(ctx, summary.uuid)) {
        addEdge(parent, summary.uuid, "signal", "detection");
      }
    }

    if (type === "rule") {
      for (const { sourceId, label } of ruleDetectionSources(
        ctx,
        summary.uuid,
      )) {
        addEdge(sourceId, summary.uuid, label, "detection");
      }
    }

    if (type === "threat") {
      for (const child of childs(ctx, summary.uuid)) {
        if (getType(ctx, child, true) === "objective") {
          addEdge(summary.uuid, child, "objective", "detection");
        }
      }
    }
  }

  for (const root of Object.keys(bundle.chaining)) {
    const chain = chainResolver(ctx, root);
    for (const [source, relations] of Object.entries(chain)) {
      for (const [relation, targets] of Object.entries(relations)) {
        for (const target of targets) {
          addEdge(source, target, shortenRelation(relation), "chaining");
        }
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
    nodeById: nodes,
    ...indexEdges(edges),
  };
}

export function outEdges(corpus: CorpusGraph, id: string): CorpusEdge[] {
  return corpus.outgoing.get(id) ?? EMPTY;
}

export function inEdges(corpus: CorpusGraph, id: string): CorpusEdge[] {
  return corpus.incoming.get(id) ?? EMPTY;
}

/** Walk detection edges from each start, against (`up`) or along (`down`) their direction. */
function walkDetection(
  corpus: CorpusGraph,
  starts: Iterable<string>,
  direction: "up" | "down",
  visit: (edge: CorpusEdge, next: string) => void,
): Set<string> {
  const seen = new Set<string>(starts);
  const queue = [...seen];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const edges =
      direction === "up" ? inEdges(corpus, id) : outEdges(corpus, id);
    for (const edge of edges) {
      if (edge.kind !== "detection") continue;
      const next = direction === "up" ? edge.source : edge.target;
      visit(edge, next);
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export function expandVisibleIds(
  corpus: CorpusGraph,
  seedIds: Set<string>,
  mode: "match-only" | "include-neighbors" | "include-chain",
): Set<string> {
  if (mode === "match-only") return new Set(seedIds);

  if (mode === "include-neighbors") {
    const visible = new Set(seedIds);
    for (const id of seedIds) {
      for (const edge of outEdges(corpus, id)) visible.add(edge.target);
      for (const edge of inEdges(corpus, id)) visible.add(edge.source);
    }
    return visible;
  }

  // Chain mode: everything upstream of a match (what it detects), everything downstream
  // (what implements it), then the threats chained to any of those.
  const visible = new Set<string>();
  for (const id of walkDetection(corpus, seedIds, "up", () => {})) {
    visible.add(id);
  }
  for (const id of walkDetection(corpus, seedIds, "down", () => {})) {
    visible.add(id);
  }
  // A snapshot: threats chained in here must not pull in their own chains.
  const chainSeeds = Array.from(visible);
  for (const id of chainSeeds) {
    for (const edge of outEdges(corpus, id)) {
      if (edge.kind === "chaining") visible.add(edge.target);
    }
    for (const edge of inEdges(corpus, id)) {
      if (edge.kind === "chaining") visible.add(edge.source);
    }
  }
  return visible;
}

export interface CausalChainHighlight {
  nodes: Set<string>;
  edges: Set<string>;
}

/** Detection chain (threat→objective→signal→rule) reachable from a node, both directions. */
export function getDetectionChain(
  corpus: CorpusGraph,
  nodeId: string,
): CausalChainHighlight {
  const edges = new Set<string>();
  const collect = (edge: CorpusEdge) => {
    edges.add(edge.id);
  };
  const nodes = new Set<string>([
    ...walkDetection(corpus, [nodeId], "up", collect),
    ...walkDetection(corpus, [nodeId], "down", collect),
  ]);
  return { nodes, edges };
}

/** Threat-to-threat chaining edges directly adjacent to a node (one hop). */
export function getThreatChaining(
  corpus: CorpusGraph,
  nodeId: string,
): CausalChainHighlight {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();

  for (const edge of outEdges(corpus, nodeId)) {
    if (edge.kind !== "chaining") continue;
    edges.add(edge.id);
    nodes.add(edge.target);
  }
  for (const edge of inEdges(corpus, nodeId)) {
    if (edge.kind !== "chaining") continue;
    edges.add(edge.id);
    nodes.add(edge.source);
  }

  return { nodes, edges };
}

/** Union of detection chain and threat chaining highlights. */
export function getCausalChain(
  corpus: CorpusGraph,
  nodeId: string,
): CausalChainHighlight {
  const detection = getDetectionChain(corpus, nodeId);
  const chaining = getThreatChaining(corpus, nodeId);

  return {
    nodes: new Set([...detection.nodes, ...chaining.nodes]),
    edges: new Set([...detection.edges, ...chaining.edges]),
  };
}
