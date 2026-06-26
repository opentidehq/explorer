import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  chainResolver,
  childs,
  createGraphContext,
  getType,
  parents,
} from "@/lib/opentide/graph";
import {
  TYPE_COLORS,
  type ExplorerBundle,
  type ObjectType,
} from "@/lib/opentide/types";

export type GraphEdgeKind = "detection" | "chaining";

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

function shortenRelation(relation: string): string {
  const parts = relation.split("::");
  return parts[parts.length - 1] ?? relation;
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
    }

    if (type === "signal") {
      for (const parent of parents(ctx, summary.uuid)) {
        addEdge(parent, summary.uuid, "signal", "detection");
      }
    }

    if (type === "rule") {
      for (const parent of parents(ctx, summary.uuid)) {
        const parentType = getType(ctx, parent, true);
        addEdge(
          parent,
          summary.uuid,
          parentType === "signal" ? "rule" : "detects",
          "detection",
        );
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
      type: "circle",
      objectType: node.type,
      color: node.color,
      size: node.size,
      x: Math.random(),
      y: Math.random(),
    });
  }

  for (const edge of edges) {
    if (!graphology.hasEdge(edge.id)) {
      graphology.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        label: edge.label,
        kind: edge.kind,
        size: edge.kind === "chaining" ? 1.5 : 1,
        color: edge.kind === "chaining" ? "#c9a000" : "#6366f1",
      });
    }
  }

  if (graphology.order > 0) {
    forceAtlas2.assign(graphology, {
      iterations: graphology.order > 200 ? 80 : 120,
      settings: {
        gravity: 0.8,
        scalingRatio: graphology.order > 200 ? 12 : 8,
        slowDown: graphology.order > 200 ? 12 : 8,
        barnesHutOptimize: graphology.order > 100,
      },
    });
  }

  return {
    nodes: [...nodes.values()],
    edges,
    graphology,
  };
}

export function filterGraph(
  corpus: CorpusGraph,
  visibleIds: Set<string>,
): { nodes: CorpusNode[]; edges: CorpusEdge[]; graphology: Graph } {
  const nodes = corpus.nodes.filter((n) => visibleIds.has(n.id));
  const nodeSet = new Set(nodes.map((n) => n.id));
  const edges = corpus.edges.filter(
    (e) => nodeSet.has(e.source) && nodeSet.has(e.target),
  );

  const graphology = new Graph({ type: "directed" });
  for (const node of nodes) {
    const pos = corpus.graphology.getNodeAttributes(node.id);
    graphology.addNode(node.id, {
      label: node.label,
      type: "circle",
      objectType: node.type,
      color: node.color,
      size: node.size,
      x: pos.x ?? Math.random(),
      y: pos.y ?? Math.random(),
    });
  }

  for (const edge of edges) {
    if (!graphology.hasEdge(edge.id)) {
      graphology.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        label: edge.label,
        kind: edge.kind,
        size: edge.kind === "chaining" ? 1.5 : 1,
        color: edge.kind === "chaining" ? "#c9a000" : "#6366f1",
      });
    }
  }

  return { nodes, edges, graphology };
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

  for (const edge of corpus.edges) {
    if (edge.kind !== "detection") continue;
    const chain = [edge.source, edge.target];
    if (visible.has(edge.source) || visible.has(edge.target)) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
    for (const id of chain) {
      for (const e of corpus.edges) {
        if (e.kind !== "detection") continue;
        if (e.source === id || e.target === id) {
          visible.add(e.source);
          visible.add(e.target);
        }
      }
    }
  }

  for (const edge of corpus.edges) {
    if (edge.kind === "chaining" && visible.has(edge.source)) {
      visible.add(edge.target);
    }
  }

  return visible;
}
