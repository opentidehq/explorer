import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCorpusGraph,
  expandVisibleIds,
  getCausalChain,
  getDetectionChain,
  inEdges,
  outEdges,
  stableCoord,
} from "@/lib/graph/corpus-graph";
import {
  applyCircularLayout,
  applyGraphTopology,
  applyGridLayout,
  applyTypeBandsLayout,
  toGraphology,
} from "@/lib/graph/graph-layout";
import {
  DISTANT_ID,
  FOLLOW_UP_ID,
  OBJECTIVE_ID,
  PRECURSOR_ID,
  RULE_ID,
  SIGNAL_B_ID,
  SIGNAL_ID,
  SIGNAL_MAPPED_RULE_ID,
  SIGNAL_RULE_ID,
  THREAT_ID,
  chainThreat,
  makeGraphFixtureBundle,
  withThreatChain,
} from "@/lib/graph/test-fixtures";
import { normalizeExplorerBundle } from "@/lib/data/catalog";
import { enrichBundle } from "@/lib/opentide/enrich-bundle";
import type { RawExplorerBundle } from "@/lib/opentide/types";

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

function edgeBetween(
  graph: ReturnType<typeof buildCorpusGraph>,
  source: string,
  target: string,
) {
  return graph.edges.find((e) => e.source === source && e.target === target);
}

describe("buildCorpusGraph", () => {
  it("deduplicates parallel edges between the same nodes", () => {
    const bundle = makeGraphFixtureBundle();
    chainThreat(bundle, THREAT_ID, "support::enabled", FOLLOW_UP_ID);
    chainThreat(bundle, THREAT_ID, "atomicity::implemented", FOLLOW_UP_ID);
    // The same relation twice in the source must not repeat in the label.
    chainThreat(bundle, THREAT_ID, "support::enabled", FOLLOW_UP_ID);

    const graph = buildCorpusGraph(bundle);

    expect(duplicateSourceTargetPairs(graph.edges)).toEqual([]);
    const edge = edgeBetween(graph, THREAT_ID, FOLLOW_UP_ID);
    expect(edge?.label).toBe("enabled, implemented");
    // Two chaining relations merge into a chaining edge, not a detection one.
    expect(edge?.kind).toBe("chaining");
    expect(outEdges(graph, THREAT_ID).filter((e) => e === edge)).toHaveLength(
      1,
    );
  });

  it("keeps a detection edge a detection edge when a chaining link runs parallel", () => {
    const bundle = makeGraphFixtureBundle();
    // Malformed, but possible: a threat that also chains to its own objective.
    bundle.chaining = {
      [THREAT_ID]: { "atomicity::implements": [OBJECTIVE_ID] },
    };

    const graph = buildCorpusGraph(bundle);
    const edge = edgeBetween(graph, THREAT_ID, OBJECTIVE_ID);

    expect(edge?.kind).toBe("detection");
    expect(edge?.label).toBe("objective, implements");
    expect(duplicateSourceTargetPairs(graph.edges)).toEqual([]);
  });

  it("drops self-loops", () => {
    const bundle = makeGraphFixtureBundle();
    bundle.chaining = {
      [THREAT_ID]: { "support::synergize": [THREAT_ID] },
    };
    // A rule that names itself as its detection model.
    bundle.flatIndex[RULE_ID] = {
      ...bundle.flatIndex[RULE_ID],
      detection_model: RULE_ID,
    };
    bundle.models.rule[RULE_ID] = bundle.flatIndex[RULE_ID]!;

    const graph = buildCorpusGraph(bundle);

    expect(graph.edges.filter((e) => e.source === e.target)).toEqual([]);
    expect(outEdges(graph, THREAT_ID).some((e) => e.kind === "chaining")).toBe(
      false,
    );
    expect(inEdges(graph, RULE_ID)).toEqual([]);
    // The object is still a node, just without the loop.
    expect(graph.nodeById.has(RULE_ID)).toBe(true);
  });

  it("includes embedded objective signals as detection-chain nodes", () => {
    const bundle = makeGraphFixtureBundle();
    const embeddedId = "b49d0a94-0000-4000-8000-0000000000e1";
    const objective = bundle.flatIndex[OBJECTIVE_ID]!["objective"] as {
      signals: Array<{ uuid: string; name: string }>;
    };
    // Embedded only: no signal object or summary of its own until enrichment.
    objective.signals.push({ uuid: embeddedId, name: "Embedded only" });

    const graph = buildCorpusGraph(enrichBundle(bundle));

    expect(graph.nodeById.get(embeddedId)?.type).toBe("signal");
    expect(edgeBetween(graph, OBJECTIVE_ID, embeddedId)?.kind).toBe(
      "detection",
    );
  });

  it("chains signal-mapped rules through signal, not objective", () => {
    const bundle = makeGraphFixtureBundle();
    const graph = buildCorpusGraph(bundle);

    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "detection" &&
          edge.source === SIGNAL_ID &&
          edge.target === SIGNAL_RULE_ID,
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "detection" &&
          edge.source === OBJECTIVE_ID &&
          edge.target === SIGNAL_RULE_ID,
      ),
    ).toBe(false);

    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "detection" &&
          edge.source === SIGNAL_B_ID &&
          edge.target === SIGNAL_MAPPED_RULE_ID,
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "detection" &&
          edge.source === OBJECTIVE_ID &&
          edge.target === SIGNAL_MAPPED_RULE_ID,
      ),
    ).toBe(false);

    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "detection" &&
          edge.source === OBJECTIVE_ID &&
          edge.target === RULE_ID,
      ),
    ).toBe(true);
  });

  it("highlights only the focused rule detection chain", () => {
    const bundle = makeGraphFixtureBundle();
    const graph = buildCorpusGraph(bundle);
    const chain = getDetectionChain(graph, SIGNAL_RULE_ID);

    expect(chain.nodes.has(SIGNAL_RULE_ID)).toBe(true);
    expect(chain.nodes.has(SIGNAL_ID)).toBe(true);
    expect(chain.nodes.has(OBJECTIVE_ID)).toBe(true);
    expect(chain.nodes.has(THREAT_ID)).toBe(true);
    expect(chain.nodes.has(SIGNAL_B_ID)).toBe(false);
    expect(chain.nodes.has(RULE_ID)).toBe(false);
  });

  it("indexes edges by endpoint for constant-time traversal", () => {
    const graph = buildCorpusGraph(makeGraphFixtureBundle());

    for (const edge of graph.edges) {
      expect(graph.outgoing.get(edge.source)).toContain(edge);
      expect(graph.incoming.get(edge.target)).toContain(edge);
    }
    expect(graph.nodeById.get(THREAT_ID)?.type).toBe("threat");
  });

  it("joins the detection chain and threat chaining around a node", () => {
    const bundle = makeGraphFixtureBundle();
    const chained = "e2ae62bb-7ce1-46cd-a131-39803832fa00";
    bundle.chaining = { [THREAT_ID]: { "sequence::preceeds": [chained] } };
    const graph = buildCorpusGraph(bundle);
    const chain = getCausalChain(graph, OBJECTIVE_ID);

    expect(chain.nodes.has(THREAT_ID)).toBe(true);
    expect(chain.nodes.has(SIGNAL_RULE_ID)).toBe(true);
    // Chaining is one hop from the focused node only.
    expect(chain.nodes.has(chained)).toBe(false);
    expect(getCausalChain(graph, THREAT_ID).nodes.has(chained)).toBe(true);
  });

  it("expands chain mode upstream without sibling signals", () => {
    const bundle = makeGraphFixtureBundle();
    const graph = buildCorpusGraph(bundle);
    const visible = expandVisibleIds(
      graph,
      new Set([SIGNAL_RULE_ID]),
      "include-chain",
    );

    expect(visible.has(SIGNAL_ID)).toBe(true);
    expect(visible.has(OBJECTIVE_ID)).toBe(true);
    expect(visible.has(THREAT_ID)).toBe(true);
    expect(visible.has(SIGNAL_B_ID)).toBe(false);
    expect(visible.has(RULE_ID)).toBe(false);
  });
});

describe("expandVisibleIds", () => {
  const graph = buildCorpusGraph(withThreatChain());

  it("returns a copy of the matches in match-only mode", () => {
    const seeds = new Set([OBJECTIVE_ID]);
    const visible = expandVisibleIds(graph, seeds, "match-only");

    expect(visible).toEqual(seeds);
    expect(visible).not.toBe(seeds);
  });

  it("adds outbound and inbound neighbours, one hop, in include-neighbors mode", () => {
    const visible = expandVisibleIds(
      graph,
      new Set([SIGNAL_ID]),
      "include-neighbors",
    );

    expect(visible).toEqual(new Set([SIGNAL_ID, OBJECTIVE_ID, SIGNAL_RULE_ID]));
  });

  it("follows chaining edges either way in include-neighbors mode", () => {
    const visible = expandVisibleIds(
      graph,
      new Set([FOLLOW_UP_ID]),
      "include-neighbors",
    );

    expect(visible).toEqual(new Set([FOLLOW_UP_ID, THREAT_ID, DISTANT_ID]));
  });

  it("adds threats chained to the detection chain, in both directions", () => {
    const visible = expandVisibleIds(
      graph,
      new Set([SIGNAL_RULE_ID]),
      "include-chain",
    );

    // Upstream of the rule, then the threats chained to that threat.
    expect(visible.has(THREAT_ID)).toBe(true);
    expect(visible.has(FOLLOW_UP_ID)).toBe(true);
    expect(visible.has(PRECURSOR_ID)).toBe(true);
  });

  it("does not pull in the chains of chained threats", () => {
    const visible = expandVisibleIds(
      graph,
      new Set([SIGNAL_RULE_ID]),
      "include-chain",
    );

    expect(visible).toEqual(
      new Set([
        SIGNAL_RULE_ID,
        SIGNAL_ID,
        OBJECTIVE_ID,
        THREAT_ID,
        PRECURSOR_ID,
        FOLLOW_UP_ID,
      ]),
    );
    expect(visible.has(DISTANT_ID)).toBe(false);
  });

  it("follows only chaining edges into what the detection chain reached", () => {
    const bundle = withThreatChain();
    // A rule implementing both signals: the other signal is its parent, not the match's.
    bundle.flatIndex[SIGNAL_RULE_ID] = {
      ...bundle.flatIndex[SIGNAL_RULE_ID],
      detection_model: [SIGNAL_ID, SIGNAL_B_ID],
    };
    bundle.models.rule[SIGNAL_RULE_ID] = bundle.flatIndex[SIGNAL_RULE_ID]!;
    const shared = buildCorpusGraph(bundle);
    expect(edgeBetween(shared, SIGNAL_B_ID, SIGNAL_RULE_ID)?.kind).toBe(
      "detection",
    );

    const visible = expandVisibleIds(
      shared,
      new Set([SIGNAL_ID]),
      "include-chain",
    );

    expect(visible.has(SIGNAL_RULE_ID)).toBe(true);
    expect(visible.has(SIGNAL_B_ID)).toBe(false);
  });

  it("walks detection edges down from a threat in chain mode", () => {
    const visible = expandVisibleIds(
      graph,
      new Set([THREAT_ID]),
      "include-chain",
    );

    for (const id of [
      OBJECTIVE_ID,
      SIGNAL_ID,
      SIGNAL_B_ID,
      RULE_ID,
      SIGNAL_RULE_ID,
      SIGNAL_MAPPED_RULE_ID,
    ]) {
      expect(visible.has(id)).toBe(true);
    }
    expect(visible.has(DISTANT_ID)).toBe(false);
  });
});

/** The bundle `pnpm test` generated from the library; a fixture run has none to check. */
const corpusRun =
  Boolean(process.env.OPENTIDE_REPO_ROOT) &&
  process.env.OPENTIDE_USE_FIXTURE !== "1";

describe.skipIf(!corpusRun)("buildCorpusGraph on the library corpus", () => {
  const bundle = corpusRun
    ? enrichBundle(
        normalizeExplorerBundle(
          JSON.parse(
            readFileSync("public/data/explorer.bundle.json", "utf8"),
          ) as RawExplorerBundle,
        ),
      )
    : null;

  it("builds one edge per pair, merging parallel chaining relations", () => {
    const graph = buildCorpusGraph(bundle!);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(bundle!.summaries.length);
    expect(duplicateSourceTargetPairs(graph.edges)).toEqual([]);
    expect(graph.edges.some((e) => e.source === e.target)).toBe(false);
    expect(
      graph.edges.some((e) => e.kind === "chaining" && e.label.includes(", ")),
    ).toBe(true);
  });

  it("links every objective to its embedded signals", () => {
    const graph = buildCorpusGraph(bundle!);
    let checked = 0;
    for (const [objectiveId, body] of Object.entries(
      bundle!.models.objective,
    )) {
      const signals = (body.objective as { signals?: Array<{ uuid?: string }> })
        ?.signals;
      for (const { uuid } of signals ?? []) {
        if (!uuid || uuid === objectiveId) continue;
        expect(edgeBetween(graph, objectiveId, uuid)?.kind).toBe("detection");
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("stableCoord", () => {
  it("is deterministic, bounded, and independent across axes", () => {
    const ids = Array.from(
      { length: 400 },
      (_, i) =>
        `${i.toString(16).padStart(8, "0")}-4b61-4116-bd97-de54b02b197e`,
    );
    const xs = ids.map((id) => stableCoord(id, 0));
    const ys = ids.map((id) => stableCoord(id, 1));
    expect(stableCoord(ids[0]!, 0)).toBe(xs[0]);
    for (const v of [...xs, ...ys]) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Seeds on a line start ForceAtlas2 degenerate; x and y must not correlate.
    const mean = (a: number[]) => a.reduce((sum, v) => sum + v, 0) / a.length;
    const mx = mean(xs);
    const my = mean(ys);
    const cov = mean(xs.map((x, i) => (x - mx) * (ys[i]! - my)));
    const sd = (a: number[], m: number) =>
      Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
    expect(Math.abs(cov / (sd(xs, mx) * sd(ys, my)))).toBeLessThan(0.15);
  });
});

describe("graph layout topologies", () => {
  it("assigns coordinates for each topology preset", () => {
    const graph = toGraphology(buildCorpusGraph(makeGraphFixtureBundle()));

    for (const topology of [
      "force",
      "circular",
      "type-bands",
      "grid",
    ] as const) {
      applyGraphTopology(graph, topology);
      graph.forEachNode((_, attrs) => {
        expect(Number.isFinite(attrs.x)).toBe(true);
        expect(Number.isFinite(attrs.y)).toBe(true);
      });
    }
  });

  it("places type bands on distinct horizontal rows", () => {
    const graph = toGraphology(buildCorpusGraph(makeGraphFixtureBundle()));
    applyTypeBandsLayout(graph);

    const yByType = new Map<string, number>();
    graph.forEachNode((_, attrs) => {
      yByType.set(String(attrs.objectType), attrs.y as number);
    });

    const threatY = yByType.get("threat");
    const objectiveY = yByType.get("objective");
    const signalY = yByType.get("signal");
    const ruleY = yByType.get("rule");

    expect(threatY).toBeDefined();
    expect(objectiveY).toBeDefined();
    expect(signalY).toBeDefined();
    expect(ruleY).toBeDefined();
    expect(new Set([threatY, objectiveY, signalY, ruleY]).size).toBe(4);
  });

  it("places circular layout nodes on a ring", () => {
    const graph = toGraphology(buildCorpusGraph(makeGraphFixtureBundle()));
    applyCircularLayout(graph);

    const radii = graph
      .nodes()
      .map((node) => {
        const { x, y } = graph.getNodeAttributes(node);
        return Math.hypot(x as number, y as number);
      })
      .filter((radius) => radius > 0);

    expect(radii.length).toBeGreaterThan(0);
    const first = radii[0]!;
    for (const radius of radii) {
      expect(radius).toBeCloseTo(first, 5);
    }
  });

  it("places grid layout nodes on a lattice", () => {
    const graph = toGraphology(buildCorpusGraph(makeGraphFixtureBundle()));
    applyGridLayout(graph);

    const xs = new Set<number>();
    const ys = new Set<number>();
    graph.forEachNode((_, attrs) => {
      xs.add(attrs.x as number);
      ys.add(attrs.y as number);
    });

    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });
});
