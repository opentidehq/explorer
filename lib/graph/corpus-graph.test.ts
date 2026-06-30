import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCircularLayout,
  applyGraphTopology,
  applyGridLayout,
  applyTypeBandsLayout,
  buildCorpusGraph,
  expandVisibleIds,
  getDetectionChain,
} from "@/lib/graph/corpus-graph";
import { enrichBundle } from "@/lib/opentide/enrich-bundle";
import type {
  ExplorerBundle,
  ModelsIndex,
  ObjectBody,
} from "@/lib/opentide/types";

const THREAT_ID = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";
const SIGNAL_B_ID = "b49d0a94-0000-4000-8000-000000000001";
const RULE_ID = "bfae62bb-7ce1-46cd-a131-39803832fa9d";
const SIGNAL_RULE_ID = "c1ae62bb-7ce1-46cd-a131-39803832fa9e";
const SIGNAL_MAPPED_RULE_ID = "d1ae62bb-7ce1-46cd-a131-39803832fa9f";

function makeGraphFixtureBundle(): ExplorerBundle {
  const threat: ObjectBody = {
    name: "Shai-Hulud",
    metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
    threat: { "att&ck": ["T1195.001"], threats: [] },
  };

  const objective: ObjectBody = {
    name: "Detect Shai-Hulud",
    metadata: { uuid: OBJECTIVE_ID, schema: "objective::1.0" },
    objective: {
      threats: [THREAT_ID],
      signals: [
        { uuid: SIGNAL_ID, name: "Install anomaly" },
        { uuid: SIGNAL_B_ID, name: "Bulk credential access" },
      ],
    },
  };

  const signalA: ObjectBody = {
    name: "Package Manager Install",
    metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
  };

  const signalB: ObjectBody = {
    name: "Bulk Credential Access",
    metadata: { uuid: SIGNAL_B_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
  };

  const directRule: ObjectBody = {
    name: "Direct Objective Rule",
    metadata: { uuid: RULE_ID, schema: "rule::1.0" },
    detection_model: OBJECTIVE_ID,
    configurations: { defender_for_endpoint: { status: "PRODUCTION" } },
  };

  const signalRule: ObjectBody = {
    name: "Signal Mapped Rule",
    metadata: { uuid: SIGNAL_RULE_ID, schema: "rule::1.0" },
    detection_model: SIGNAL_ID,
    configurations: { sentinel: { status: "STAGING" } },
  };

  const objectiveSignalRule: ObjectBody = {
    name: "Objective DM Signal Rule",
    metadata: { uuid: SIGNAL_MAPPED_RULE_ID, schema: "rule::1.0" },
    detection_model: OBJECTIVE_ID,
    description: `Implements DOM signal ${SIGNAL_B_ID}`,
    configurations: { sentinel: { status: "PRODUCTION" } },
  };

  const models: ModelsIndex = {
    threat: { [THREAT_ID]: threat },
    objective: { [OBJECTIVE_ID]: objective },
    signal: { [SIGNAL_ID]: signalA, [SIGNAL_B_ID]: signalB },
    rule: {
      [RULE_ID]: directRule,
      [SIGNAL_RULE_ID]: signalRule,
      [SIGNAL_MAPPED_RULE_ID]: objectiveSignalRule,
    },
  };

  const flatIndex = {
    [THREAT_ID]: threat,
    [OBJECTIVE_ID]: objective,
    [SIGNAL_ID]: signalA,
    [SIGNAL_B_ID]: signalB,
    [RULE_ID]: directRule,
    [SIGNAL_RULE_ID]: signalRule,
    [SIGNAL_MAPPED_RULE_ID]: objectiveSignalRule,
  };

  return {
    version: "0.1.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
    models,
    flatIndex,
    chaining: {},
    signals: { [SIGNAL_ID]: signalA, [SIGNAL_B_ID]: signalB },
    summaries: [
      {
        uuid: THREAT_ID,
        type: "threat",
        name: "Shai-Hulud",
        schema: "threat::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
      {
        uuid: OBJECTIVE_ID,
        type: "objective",
        name: "Detect Shai-Hulud",
        schema: "objective::1.0",
        techniques: [],
        actors: [],
        relatedCount: 3,
        platforms: [],
      },
      {
        uuid: SIGNAL_ID,
        type: "signal",
        name: "Package Manager Install",
        schema: "signal::1.0",
        techniques: [],
        actors: [],
        relatedCount: 2,
        platforms: [],
      },
      {
        uuid: SIGNAL_B_ID,
        type: "signal",
        name: "Bulk Credential Access",
        schema: "signal::1.0",
        techniques: [],
        actors: [],
        relatedCount: 2,
        platforms: [],
      },
      {
        uuid: RULE_ID,
        type: "rule",
        name: "Direct Objective Rule",
        schema: "rule::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
      {
        uuid: SIGNAL_RULE_ID,
        type: "rule",
        name: "Signal Mapped Rule",
        schema: "rule::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
      {
        uuid: SIGNAL_MAPPED_RULE_ID,
        type: "rule",
        name: "Objective DM Signal Rule",
        schema: "rule::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
    ],
  };
}

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

  it("includes embedded objective signals as detection-chain nodes", () => {
    const bundle = enrichBundle(
      JSON.parse(
        readFileSync("public/data/explorer.bundle.json", "utf8"),
      ) as ExplorerBundle,
    );

    const graph = buildCorpusGraph(bundle);
    const signalSummaries = bundle.summaries.filter((s) => s.type === "signal");

    expect(signalSummaries.length).toBeGreaterThan(0);
    expect(graph.nodes.some((n) => n.type === "signal")).toBe(true);

    const objectiveWithSignal = Object.entries(bundle.models.objective).find(
      ([, body]) => {
        const signals = (body?.objective as { signals?: unknown[] } | undefined)
          ?.signals;
        return (signals?.length ?? 0) > 0;
      },
    );
    expect(objectiveWithSignal).toBeTruthy();

    const [objectiveId, objectiveBody] = objectiveWithSignal!;
    const signals = (
      objectiveBody.objective as { signals: Array<{ uuid: string }> }
    ).signals;
    const signalId = signals[0]!.uuid;

    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "detection" &&
          edge.source === objectiveId &&
          edge.target === signalId,
      ),
    ).toBe(true);
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

describe("graph layout topologies", () => {
  it("assigns coordinates for each topology preset", () => {
    const graph = buildCorpusGraph(makeGraphFixtureBundle()).graphology;

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
    const graph = buildCorpusGraph(makeGraphFixtureBundle()).graphology;
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
    const graph = buildCorpusGraph(makeGraphFixtureBundle()).graphology;
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
    const graph = buildCorpusGraph(makeGraphFixtureBundle()).graphology;
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
