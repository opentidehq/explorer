/// <reference lib="webworker" />
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  forceAtlasIterations,
  forceAtlasSettings,
} from "@/lib/graph/graph-layout";
import type { LayoutRequest, LayoutResponse } from "@/lib/graph/layout-client";

/**
 * ForceAtlas2 off the main thread: the same fixed iteration count as the synchronous run, on
 * a graph rebuilt in the same node and edge order, so both give the same layout.
 */
self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { nodes, edges } = event.data;
  const graph = new Graph({ type: "directed" });
  for (const [id, x, y] of nodes) graph.addNode(id, { x, y });
  for (const [source, target] of edges) {
    if (
      graph.hasNode(source) &&
      graph.hasNode(target) &&
      !graph.hasEdge(source, target)
    ) {
      graph.addDirectedEdge(source, target);
    }
  }
  forceAtlas2.assign(graph, {
    iterations: forceAtlasIterations(graph.order),
    settings: forceAtlasSettings(graph.order),
  });
  const positions = new Float64Array(nodes.length * 2);
  nodes.forEach(([id], i) => {
    positions[i * 2] = graph.getNodeAttribute(id, "x") as number;
    positions[i * 2 + 1] = graph.getNodeAttribute(id, "y") as number;
  });
  const response: LayoutResponse = { positions };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response, [
    positions.buffer,
  ]);
};
