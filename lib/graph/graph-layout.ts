import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  stableCoord,
  type CorpusGraph,
  type GraphEdgeKind,
} from "@/lib/graph/corpus-graph";
import type { GraphLayoutTopology } from "@/lib/graph/render-styles";
import type { ObjectType } from "@/lib/opentide/types";

/**
 * The corpus as a graphology instance, and the layouts the graph view offers. Only the graph
 * view imports this module, so graphology and ForceAtlas2 stay out of the first load.
 */

export type GraphNodeKind = ObjectType | "vocab";

export interface GraphNodeAttributes {
  label: string;
  objectType: GraphNodeKind;
  size: number;
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface GraphEdgeAttributes {
  label: string;
  kind: GraphEdgeKind;
  size: number;
  [key: string]: unknown;
}

export function toGraphology(corpus: CorpusGraph): Graph {
  const graph = new Graph({ type: "directed" });
  for (const node of corpus.nodes) {
    graph.addNode(node.id, {
      label: node.label,
      objectType: node.type,
      size: node.size,
      x: stableCoord(node.id, 0),
      y: stableCoord(node.id, 1),
    } satisfies GraphNodeAttributes);
  }
  for (const edge of corpus.edges) {
    if (graph.hasEdge(edge.id)) continue;
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      label: edge.label,
      kind: edge.kind,
      size: edge.kind === "chaining" ? 1.2 : 1,
    } satisfies GraphEdgeAttributes);
  }
  return graph;
}

const TYPE_BAND_ORDER: GraphNodeKind[] = [
  "threat",
  "objective",
  "signal",
  "rule",
  "vocab",
];

/** ForceAtlas2 settings for a graph of this many nodes; shared by the sync and worker runs. */
export function forceAtlasSettings(order: number) {
  const large = order > 200;
  return {
    gravity: 0.9,
    scalingRatio: large ? 12 : 8,
    slowDown: large ? 12 : 8,
    barnesHutOptimize: order > 100,
    adjustSizes: false,
  };
}

export function forceAtlasIterations(order: number): number {
  return order > 200 ? 90 : 120;
}

export function applyForceAtlasLayout(graph: Graph): void {
  if (graph.order === 0) return;
  forceAtlas2.assign(graph, {
    iterations: forceAtlasIterations(graph.order),
    settings: forceAtlasSettings(graph.order),
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
  const byType = new Map<GraphNodeKind, string[]>();
  for (const type of TYPE_BAND_ORDER) byType.set(type, []);

  graph.forEachNode((node, attrs) => {
    const type = (attrs.objectType as GraphNodeKind | undefined) ?? "threat";
    (byType.get(type) ?? byType.get("threat")!).push(node);
  });

  const bandGap = 4;
  const nodeSpacing = 0.5;

  TYPE_BAND_ORDER.forEach((type, bandIndex) => {
    const nodeIds = byType.get(type) ?? [];
    if (!nodeIds.length) return;

    nodeIds.sort();
    // Bands run top to bottom in ontology order; sigma's y axis points up.
    const centerY = ((TYPE_BAND_ORDER.length - 1) / 2 - bandIndex) * bandGap;
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length * 3)));
    const rows = Math.ceil(nodeIds.length / columns);

    nodeIds.forEach((id, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x =
        (col - (Math.min(nodeIds.length, columns) - 1) / 2) * nodeSpacing;
      const y = centerY - (row - (rows - 1) / 2) * nodeSpacing * 0.8;
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
