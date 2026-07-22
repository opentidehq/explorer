import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  chainResolver,
  childs,
  createGraphContext,
  getType,
  parents,
  ruleDetectionSources,
} from "@/lib/opentide/graph";
import { nodeIconUrl } from "@/lib/graph/node-icons";
import { GRAPH_CANVAS_BG } from "@/lib/graph/render-styles";
import {
  TYPE_COLORS,
  type ExplorerBundle,
  type ObjectType,
} from "@/lib/opentide/types";
import type { GraphLayoutTopology } from "@/lib/graph/render-styles";

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
  color: string;
  size: number;
}

export interface CorpusGraph {
  nodes: CorpusNode[];
  edges: CorpusEdge[];
  graphology: Graph;
}

const NODE_SIZE: Record<ObjectType, number> = {
  threat: 14,
  objective: 12,
  signal: 10,
  rule: 10,
};

export function stableCoord(id: string, axis: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i) + axis * 17) | 0;
  }
  return ((hash % 1000) / 1000) * 2 - 1;
}

function shortenRelation(relation: string): string {
  const parts = relation.split("::");
  return parts[parts.length - 1] ?? relation;
}

const TYPE_BAND_ORDER: (ObjectType | "vocab")[] = [
  "threat",
  "objective",
  "signal",
  "rule",
  "vocab",
];

export function applyForceAtlasLayout(graph: Graph): void {
  if (graph.order === 0) return;
  forceAtlas2.assign(graph, {
    iterations: graph.order > 200 ? 80 : 120,
    settings: {
      gravity: 0.8,
      scalingRatio: graph.order > 200 ? 12 : 8,
      slowDown: graph.order > 200 ? 12 : 8,
      barnesHutOptimize: graph.order > 100,
    },
  });
}

export function applyCircularLayout(graph: Graph): void {
  const nodes = graph.nodes();
  const count = nodes.length;
  if (count === 0) return;

  const radius = Math.max(3, Math.sqrt(count) * 1.2);
  nodes.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / count;
    graph.setNodeAttribute(node, "x", radius * Math.cos(angle));
    graph.setNodeAttribute(node, "y", radius * Math.sin(angle));
  });
}

export function applyTypeBandsLayout(graph: Graph): void {
  const byType = new Map<ObjectType | "vocab", string[]>();
  for (const type of TYPE_BAND_ORDER) {
    byType.set(type, []);
  }

  graph.forEachNode((node, attrs) => {
    const type =
      (attrs.objectType as ObjectType | "vocab" | undefined) ?? "threat";
    const bucket = byType.get(type) ?? byType.get("threat")!;
    bucket.push(node);
  });

  const bandGap = 4;
  const nodeSpacing = 0.5;

  TYPE_BAND_ORDER.forEach((type, bandIndex) => {
    const nodeIds = byType.get(type) ?? [];
    if (!nodeIds.length) return;

    nodeIds.sort();
    const centerY = (bandIndex - (TYPE_BAND_ORDER.length - 1) / 2) * bandGap;
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
    const rows = Math.ceil(nodeIds.length / columns);

    nodeIds.forEach((id, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x =
        (col - (Math.min(nodeIds.length, columns) - 1) / 2) * nodeSpacing;
      const y = centerY + (row - (rows - 1) / 2) * nodeSpacing * 0.8;
      graph.setNodeAttribute(id, "x", x);
      graph.setNodeAttribute(id, "y", y);
    });
  });
}

export function applyGridLayout(graph: Graph): void {
  const nodes = graph.nodes();
  const count = nodes.length;
  if (count === 0) return;

  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const spacing = 1.2;

  nodes.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    graph.setNodeAttribute(node, "x", (col - (columns - 1) / 2) * spacing);
    graph.setNodeAttribute(node, "y", (row - (rows - 1) / 2) * spacing);
  });
}

export function applyGraphTopology(
  graph: Graph,
  topology: GraphLayoutTopology,
): void {
  switch (topology) {
    case "force":
      applyForceAtlasLayout(graph);
      break;
    case "circular":
      applyCircularLayout(graph);
      break;
    case "type-bands":
      applyTypeBandsLayout(graph);
      break;
    case "grid":
      applyGridLayout(graph);
      break;
  }
}

export function buildCorpusGraph(bundle: ExplorerBundle): CorpusGraph {
  const ctx = createGraphContext(bundle);
  const nodes = new Map<string, CorpusNode>();
  const edges: CorpusEdge[] = [];
  const edgeByPair = new Map<string, number>();

  function ensureNode(id: string) {
    if (nodes.has(id)) return;
    const summary = bundle.summaries.find((s) => s.uuid === id);
    const type = (summary?.type ??
      getType(ctx, id, true) ??
      "threat") as ObjectType;
    nodes.set(id, {
      id,
      label: summary?.name ?? id.slice(0, 8),
      type,
      color: TYPE_COLORS[type],
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
    edges.push({
      id: pairKey,
      source,
      target,
      label,
      kind,
    });
  }

  for (const summary of bundle.summaries) {
    ensureNode(summary.uuid);
    const type = summary.type;

    if (type === "objective") {
      for (const parent of parents(ctx, summary.uuid)) {
        addEdge(parent, summary.uuid, "objective", "detection");
      }
      for (const child of childs(ctx, summary.uuid)) {
        const childType = getType(ctx, child, true);
        if (childType === "signal") {
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
        const childType = getType(ctx, child, true);
        if (childType === "objective") {
          addEdge(summary.uuid, child, "objective", "detection");
        }
      }
    }
  }

  const chainRoots = Object.keys(bundle.chaining);
  for (const root of chainRoots) {
    const chain = chainResolver(ctx, root);
    for (const [source, relations] of Object.entries(chain)) {
      for (const [relation, targets] of Object.entries(relations)) {
        for (const target of targets) {
          addEdge(source, target, shortenRelation(relation), "chaining");
        }
      }
    }
  }

  const graphology = new Graph({ type: "directed" });
  for (const node of nodes.values()) {
    graphology.addNode(node.id, {
      label: node.label,
      type: "image",
      objectType: node.type,
      color: GRAPH_CANVAS_BG,
      size: node.size,
      image: nodeIconUrl(node.type),
      x: stableCoord(node.id, 0),
      y: stableCoord(node.id, 1),
    });
  }

  for (const edge of edges) {
    if (!graphology.hasEdge(edge.id)) {
      graphology.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        label: edge.label,
        kind: edge.kind,
        type: "curvedArrow",
        size: edge.kind === "chaining" ? 1.5 : 1,
        color: edge.kind === "chaining" ? "#e8a83880" : "#6366f1",
      });
    }
  }

  applyForceAtlasLayout(graphology);

  return {
    nodes: [...nodes.values()],
    edges,
    graphology,
  };
}

export function expandVisibleIds(
  corpus: CorpusGraph,
  seedIds: Set<string>,
  mode: "match-only" | "include-neighbors" | "include-chain",
): Set<string> {
  if (mode === "match-only") return new Set(seedIds);

  const visible = new Set(seedIds);
  if (mode === "include-neighbors") {
    for (const edge of corpus.edges) {
      if (visible.has(edge.source)) visible.add(edge.target);
      if (visible.has(edge.target)) visible.add(edge.source);
    }
    return visible;
  }

  const seeds = new Set(seedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of corpus.edges) {
      if (edge.kind !== "detection") continue;
      if (visible.has(edge.target) && !visible.has(edge.source)) {
        visible.add(edge.source);
        changed = true;
      }
    }
  }

  const downstreamFrontier = new Set(seeds);
  changed = true;
  while (changed) {
    changed = false;
    for (const edge of corpus.edges) {
      if (edge.kind !== "detection") continue;
      if (downstreamFrontier.has(edge.source) && !visible.has(edge.target)) {
        visible.add(edge.target);
        downstreamFrontier.add(edge.target);
        changed = true;
      }
    }
  }

  for (const edge of corpus.edges) {
    if (edge.kind === "chaining") {
      if (visible.has(edge.source)) visible.add(edge.target);
      if (visible.has(edge.target)) visible.add(edge.source);
    }
  }

  return visible;
}

export interface CausalChainHighlight {
  nodes: Set<string>;
  edges: Set<string>;
}

function traverseDirectedDetectionChain(
  corpus: CorpusGraph,
  startId: string,
): CausalChainHighlight {
  const nodes = new Set<string>([startId]);
  const edges = new Set<string>();

  const upstreamQueue = [startId];
  const upstreamVisited = new Set<string>([startId]);
  while (upstreamQueue.length > 0) {
    const id = upstreamQueue.pop()!;
    for (const edge of corpus.edges) {
      if (edge.kind !== "detection" || edge.target !== id) continue;
      edges.add(edge.id);
      if (!upstreamVisited.has(edge.source)) {
        upstreamVisited.add(edge.source);
        nodes.add(edge.source);
        upstreamQueue.push(edge.source);
      }
    }
  }

  const downstreamQueue = [startId];
  const downstreamVisited = new Set<string>([startId]);
  while (downstreamQueue.length > 0) {
    const id = downstreamQueue.pop()!;
    for (const edge of corpus.edges) {
      if (edge.kind !== "detection" || edge.source !== id) continue;
      edges.add(edge.id);
      if (!downstreamVisited.has(edge.target)) {
        downstreamVisited.add(edge.target);
        nodes.add(edge.target);
        downstreamQueue.push(edge.target);
      }
    }
  }

  return { nodes, edges };
}

/** Detection chain (threat→objective→signal→rule) reachable from a hovered node. */
export function getDetectionChain(
  corpus: CorpusGraph,
  nodeId: string,
): CausalChainHighlight {
  return traverseDirectedDetectionChain(corpus, nodeId);
}

/** Threat-to-threat chaining edges directly adjacent to a node (one hop). */
export function getThreatChaining(
  corpus: CorpusGraph,
  nodeId: string,
): CausalChainHighlight {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();

  for (const edge of corpus.edges) {
    if (edge.kind !== "chaining") continue;
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    edges.add(edge.id);
    nodes.add(edge.source === nodeId ? edge.target : edge.source);
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
