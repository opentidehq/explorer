import type Graph from "graphology";
import { applyForceAtlasLayout } from "@/lib/graph/graph-layout";

export interface LayoutRequest {
  /** `[id, x, y]` in graph order. */
  nodes: Array<[string, number, number]>;
  edges: Array<[string, string]>;
}

export interface LayoutResponse {
  /** x, y per node, in request order. */
  positions: Float64Array;
}

export type LayoutTargets = Record<string, { x: number; y: number }>;

function request(graph: Graph): LayoutRequest {
  const nodes: LayoutRequest["nodes"] = [];
  graph.forEachNode((id, attrs) => {
    nodes.push([id, attrs.x as number, attrs.y as number]);
  });
  const edges: LayoutRequest["edges"] = [];
  graph.forEachEdge((_edge, _attrs, source, target) => {
    edges.push([source, target]);
  });
  return { nodes, edges };
}

/** Run ForceAtlas2 on the graph's current positions, synchronously, without touching it. */
function layoutHere(graph: Graph): LayoutTargets {
  const copy = graph.copy();
  applyForceAtlasLayout(copy);
  const targets: LayoutTargets = {};
  copy.forEachNode((id, attrs) => {
    targets[id] = { x: attrs.x as number, y: attrs.y as number };
  });
  return targets;
}

/**
 * The ForceAtlas2 layout of a graph, computed in a worker so the page stays responsive; falls
 * back to the main thread where workers are unavailable. The graph itself is not modified.
 */
export function computeLayout(graph: Graph): {
  result: Promise<LayoutTargets>;
  cancel: () => void;
} {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
      name: "opentide-layout",
    });
  } catch {
    worker = null;
  }
  if (!worker) {
    return { result: Promise.resolve(layoutHere(graph)), cancel: () => {} };
  }

  const payload = request(graph);
  const live = worker;
  const result = new Promise<LayoutTargets>((resolve) => {
    live.onmessage = (event: MessageEvent<LayoutResponse>) => {
      const { positions } = event.data;
      const targets: LayoutTargets = {};
      payload.nodes.forEach(([id], i) => {
        targets[id] = { x: positions[i * 2]!, y: positions[i * 2 + 1]! };
      });
      live.terminate();
      resolve(targets);
    };
    live.onerror = () => {
      live.terminate();
      resolve(layoutHere(graph));
    };
    live.postMessage(payload);
  });
  return { result, cancel: () => live.terminate() };
}
