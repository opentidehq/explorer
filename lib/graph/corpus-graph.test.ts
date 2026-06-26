import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCorpusGraph } from "@/lib/graph/corpus-graph";
import type { ExplorerBundle } from "@/lib/opentide/types";

function duplicateSourceTargetPairs(
  edges: { source: string; target: string }[],
) {
  const pairs = new Map<string, number>();
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  return [...pairs.entries()].filter(([, count]) => count > 1);
}

describe("buildCorpusGraph", () => {
  it("deduplicates parallel edges between the same nodes", () => {
    const bundle = JSON.parse(
      readFileSync("public/data/explorer.bundle.json", "utf8"),
    ) as ExplorerBundle;

    const graph = buildCorpusGraph(bundle);

    expect(duplicateSourceTargetPairs(graph.edges)).toEqual([]);
    expect(
      graph.edges.some(
        (edge) =>
          edge.source === "31e7f292-8370-4255-861d-edd68ed8b7b0" &&
          edge.target === "4e7eae8e-6615-41f2-bfe1-21a04f7a6088" &&
          edge.label.includes("enabled") &&
          edge.label.includes("implemented"),
      ),
    ).toBe(true);
  });
});
