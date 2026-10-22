import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCorpusGraph, getThreatChaining } from "@/lib/graph/corpus-graph";
import {
  DISTANT_ID,
  FOLLOW_UP_ID,
  OBJECTIVE_ID,
  PRECURSOR_ID,
  THREAT_ID,
  chainThreat,
  withThreatChain,
} from "@/lib/graph/test-fixtures";
import {
  buildThreatChainTree,
  countThreatChainNodes,
} from "@/lib/graph/threat-chain";
import { normalizeExplorerBundle } from "@/lib/data/catalog";
import { createGraphContext } from "@/lib/opentide/graph";
import type { RawExplorerBundle } from "@/lib/opentide/types";

describe("threat chaining highlights", () => {
  const graph = buildCorpusGraph(withThreatChain());

  it("highlights only direct chaining neighbors, not the full transitive chain", () => {
    const direct = getThreatChaining(graph, THREAT_ID);

    expect(direct.nodes).toEqual(
      new Set([THREAT_ID, PRECURSOR_ID, FOLLOW_UP_ID]),
    );
    expect(direct.edges).toEqual(
      new Set([`${PRECURSOR_ID}|${THREAT_ID}`, `${THREAT_ID}|${FOLLOW_UP_ID}`]),
    );
    // Reachable through the follow-up, but two hops away.
    expect(direct.nodes.has(DISTANT_ID)).toBe(false);
  });

  it("ignores detection edges", () => {
    const direct = getThreatChaining(graph, THREAT_ID);

    expect(direct.nodes.has(OBJECTIVE_ID)).toBe(false);
    expect(getThreatChaining(graph, OBJECTIVE_ID).nodes).toEqual(
      new Set([OBJECTIVE_ID]),
    );
  });
});

describe("buildThreatChainTree", () => {
  it("resolves transitive chains for modal display", () => {
    const ctx = createGraphContext(withThreatChain());
    const tree = buildThreatChainTree(ctx, THREAT_ID);

    expect(tree).toMatchObject({ id: THREAT_ID, isRoot: true });
    expect(tree?.outgoing).toHaveLength(1);
    const [link] = tree!.outgoing;
    expect(link).toMatchObject({
      relation: "sequence::preceeds",
      description: "Install hooks run the payload",
      target: { id: FOLLOW_UP_ID, isRoot: false, isReference: false },
    });
    expect(link!.target.outgoing.map((edge) => edge.target.id)).toEqual([
      DISTANT_ID,
    ]);
    // Only what the root leads to: the precursor chains into it, not from it.
    expect(countThreatChainNodes(tree!)).toBe(3);
  });

  it("marks a threat already on the path as a reference instead of re-expanding it", () => {
    const bundle = withThreatChain();
    chainThreat(bundle, DISTANT_ID, "sequence::preceeds", THREAT_ID);
    const tree = buildThreatChainTree(createGraphContext(bundle), THREAT_ID);

    const distant = tree!.outgoing[0]!.target.outgoing[0]!.target;
    const back = distant.outgoing[0]!.target;
    expect(back).toEqual({
      id: THREAT_ID,
      isRoot: false,
      isReference: true,
      outgoing: [],
    });
    expect(countThreatChainNodes(tree!)).toBe(3);
  });

  it("returns null for a threat without chaining", () => {
    const ctx = createGraphContext(withThreatChain());

    expect(buildThreatChainTree(ctx, DISTANT_ID)).toBeNull();
    expect(buildThreatChainTree(ctx, OBJECTIVE_ID)).toBeNull();
  });

  it("reads links from the threat body when the chaining index lacks them", () => {
    const bundle = withThreatChain();
    delete bundle.chaining[THREAT_ID];
    const tree = buildThreatChainTree(createGraphContext(bundle), THREAT_ID);

    // The body says it chains, but nothing resolves: a root with no branches.
    expect(tree).toEqual({
      id: THREAT_ID,
      isRoot: true,
      isReference: false,
      outgoing: [],
    });
  });
});

/** The bundle `pnpm test` generated from the library; a fixture run has none to check. */
const corpusRun =
  Boolean(process.env.OPENTIDE_REPO_ROOT) &&
  process.env.OPENTIDE_USE_FIXTURE !== "1";

describe.skipIf(!corpusRun)("threat chains on the library corpus", () => {
  const bundle = corpusRun
    ? normalizeExplorerBundle(
        JSON.parse(
          readFileSync("public/data/explorer.bundle.json", "utf8"),
        ) as RawExplorerBundle,
      )
    : null;

  it("resolves a tree for every chained threat", () => {
    const ctx = createGraphContext(bundle!);
    const roots = Object.keys(bundle!.chaining);
    expect(roots.length).toBeGreaterThan(0);
    const sizes = roots.map((root) => {
      const tree = buildThreatChainTree(ctx, root);
      expect(tree?.isRoot).toBe(true);
      return countThreatChainNodes(tree!);
    });
    // The root counts itself; a chained threat brings at least one more node.
    expect(Math.max(...sizes)).toBeGreaterThan(1);
  });
});
