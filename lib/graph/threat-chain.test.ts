import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCorpusGraph, getThreatChaining } from "@/lib/graph/corpus-graph";
import {
  buildThreatChainTree,
  countThreatChainNodes,
} from "@/lib/graph/threat-chain";
import { createGraphContext } from "@/lib/opentide/graph";
import type { ExplorerBundle } from "@/lib/opentide/types";

describe("threat chaining highlights", () => {
  const bundle = JSON.parse(
    readFileSync("public/data/explorer.bundle.json", "utf8"),
  ) as ExplorerBundle;
  const graph = buildCorpusGraph(bundle);

  it("highlights only direct chaining neighbors, not the full transitive chain", () => {
    const root = Object.keys(bundle.chaining).find((id) => {
      const direct = getThreatChaining(graph, id);
      return direct.nodes.size >= 3;
    });
    expect(root).toBeTruthy();

    const direct = getThreatChaining(graph, root!);
    expect(direct.nodes.has(root!)).toBe(true);

    const chainingEdges = graph.edges.filter(
      (edge) => edge.kind === "chaining",
    );
    const reachable = new Set<string>([root!]);
    const queue = [root!];
    while (queue.length) {
      const id = queue.pop()!;
      for (const edge of chainingEdges) {
        if (edge.source !== id && edge.target !== id) continue;
        const other = edge.source === id ? edge.target : edge.source;
        if (!reachable.has(other)) {
          reachable.add(other);
          queue.push(other);
        }
      }
    }

    if (reachable.size > direct.nodes.size) {
      expect(direct.nodes.size).toBeLessThan(reachable.size);
    } else {
      expect(direct.nodes.size).toBe(reachable.size);
    }
  });
});

describe("buildThreatChainTree", () => {
  const bundle = JSON.parse(
    readFileSync("public/data/explorer.bundle.json", "utf8"),
  ) as ExplorerBundle;
  const ctx = createGraphContext(bundle);

  it("resolves transitive chains for modal display", () => {
    const root = Object.keys(bundle.chaining)[0];
    expect(root).toBeTruthy();

    const tree = buildThreatChainTree(ctx, root!);
    expect(tree).not.toBeNull();
    expect(tree?.isRoot).toBe(true);
    expect(countThreatChainNodes(tree!)).toBeGreaterThan(0);
  });
});
