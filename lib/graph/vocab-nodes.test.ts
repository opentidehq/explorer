import { describe, expect, it } from "vitest";
import { buildCorpusGraph } from "@/lib/graph/corpus-graph";
import { toGraphology } from "@/lib/graph/graph-layout";
import { enrichBundle } from "@/lib/opentide/enrich-bundle";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  ObjectBody,
} from "@/lib/opentide/types";
import type { VocabIndex } from "@/lib/opentide/vocab";
import {
  buildVocabGraphLayer,
  collectObjectVocabReferences,
  expandVisibleIdsWithVocab,
  isVocabNodeId,
  syncVocabLayer,
  vocabNodeId,
} from "@/lib/graph/vocab-nodes";

const THREAT_ID = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";
const RULE_ID = "bfae62bb-7ce1-46cd-a131-39803832fa9d";

const vocabIndex: VocabIndex = {
  severity: {
    High: { name: "High", description: "High severity" },
  },
  killchain: {
    Persistence: {
      name: "Persistence",
      stage: "Network Propagation",
    },
  },
  surface: {
    "surface::cloud": { name: "Cloud", description: "Cloud surface" },
  },
  actors: {
    "actor::apt29": { name: "APT29", description: "Cozy Bear" },
  },
};

function makeThreatBundle(body: ObjectBody): ExplorerBundle {
  const summary: BundleObjectSummary = {
    uuid: THREAT_ID,
    type: "threat",
    name: "Test Threat",
    schema: "threat::1.0",
    techniques: [],
    actors: ["actor::apt29"],
    relatedCount: 0,
    platforms: [],
  };

  return {
    version: "0.1.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
    models: {
      threat: { [THREAT_ID]: body },
      objective: {},
      signal: {},
      rule: {},
    },
    flatIndex: { [THREAT_ID]: body },
    chaining: {},
    signals: {},
    summaries: [summary],
  };
}

function makeLinkedThreatObjectiveBundle(
  threatBody: ObjectBody,
): ExplorerBundle {
  const threatBundle = makeThreatBundle(threatBody);
  const objective: ObjectBody = {
    name: "Detect Threat",
    metadata: { uuid: OBJECTIVE_ID, schema: "objective::1.0" },
    objective: {
      threats: [THREAT_ID],
      signals: [{ uuid: SIGNAL_ID, name: "Install anomaly" }],
    },
  };
  const signal: ObjectBody = {
    name: "Install anomaly",
    metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
  };
  const rule: ObjectBody = {
    name: "Direct Objective Rule",
    metadata: { uuid: RULE_ID, schema: "rule::1.0" },
    detection_model: OBJECTIVE_ID,
    configurations: { defender_for_endpoint: { status: "PRODUCTION" } },
  };

  return {
    ...threatBundle,
    models: {
      ...threatBundle.models,
      objective: { [OBJECTIVE_ID]: objective },
      signal: { [SIGNAL_ID]: signal },
      rule: { [RULE_ID]: rule },
    },
    flatIndex: {
      ...threatBundle.flatIndex,
      [OBJECTIVE_ID]: objective,
      [SIGNAL_ID]: signal,
      [RULE_ID]: rule,
    },
    summaries: [
      ...threatBundle.summaries,
      {
        uuid: OBJECTIVE_ID,
        type: "objective",
        name: "Detect Threat",
        schema: "objective::1.0",
        techniques: [],
        actors: [],
        relatedCount: 2,
        platforms: [],
      },
    ],
  };
}

describe("vocab node ids", () => {
  it("builds stable prefixed ids", () => {
    const id = vocabNodeId("severity", "High");
    expect(id).toBe("vocab::severity::High");
    expect(isVocabNodeId(id)).toBe(true);
    expect(isVocabNodeId(THREAT_ID)).toBe(false);
  });
});

describe("collectObjectVocabReferences", () => {
  it("extracts vocab-backed fields from threat bodies", () => {
    const bundle = makeThreatBundle({
      name: "Test Threat",
      metadata: { uuid: THREAT_ID, schema: "threat::1.0", tlp: "TLP:AMBER" },
      threat: {
        severity: "High",
        actors: ["actor::apt29"],
        killchain: "Persistence",
        terrain: "Attacker focuses on cloud workloads.",
        surface: ["surface::cloud"],
      },
    });
    const summary = bundle.summaries[0]!;
    const body = bundle.flatIndex[THREAT_ID]!;

    const refs = collectObjectVocabReferences(summary, body, vocabIndex);
    const buckets = refs.map((ref) => ref.bucket);

    expect(buckets).toContain("severity");
    expect(buckets).toContain("actors");
    expect(buckets).toContain("killchain");
    expect(buckets).toContain("surface");
    expect(buckets).toContain("tlp");
  });
});

describe("buildVocabGraphLayer", () => {
  it("only links vocab nodes to requested visible objects", () => {
    const bundle = makeThreatBundle({
      name: "Test Threat",
      metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
      threat: { severity: "High" },
    });

    const layer = buildVocabGraphLayer(
      bundle,
      new Set([THREAT_ID]),
      vocabIndex,
    );

    expect(layer.nodes).toHaveLength(1);
    expect(layer.nodes[0]?.id).toBe(vocabNodeId("severity", "High"));
    expect(layer.edges).toHaveLength(1);
    expect(layer.edges[0]?.source).toBe(THREAT_ID);
    expect(layer.edges[0]?.kind).toBe("vocab");

    const empty = buildVocabGraphLayer(bundle, new Set(), vocabIndex);
    expect(empty.nodes).toHaveLength(0);
    expect(empty.edges).toHaveLength(0);
  });

  it("deduplicates parallel vocab edges on the same pair", () => {
    const bundle = makeThreatBundle({
      name: "Test Threat",
      metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
      threat: {
        severity: "High",
        impact: "High",
      },
    });

    const layer = buildVocabGraphLayer(bundle, new Set([THREAT_ID]), {
      ...vocabIndex,
      impact: { High: { name: "High" } },
    });

    const severityEdges = layer.edges.filter(
      (edge) => edge.target === vocabNodeId("severity", "High"),
    );
    expect(severityEdges).toHaveLength(1);
    expect(severityEdges[0]?.label).toContain("Severity");
  });
});

describe("expandVisibleIdsWithVocab", () => {
  it("includes vocab targets for visible objects", () => {
    const layer = buildVocabGraphLayer(
      makeThreatBundle({
        name: "Test Threat",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { severity: "High" },
      }),
      new Set([THREAT_ID]),
      vocabIndex,
    );

    const expanded = expandVisibleIdsWithVocab(new Set([THREAT_ID]), layer);
    expect(expanded.has(THREAT_ID)).toBe(true);
    expect(expanded.has(vocabNodeId("severity", "High"))).toBe(true);
  });
});

describe("syncVocabLayer", () => {
  const threatBundle = () =>
    enrichBundle(
      makeLinkedThreatObjectiveBundle({
        name: "Test Threat",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { severity: "High" },
      }),
    );
  const vocabId = vocabNodeId("severity", "High");

  it("adds vocab nodes beside the object that names them, in place", () => {
    const bundle = threatBundle();
    const graph = toGraphology(buildCorpusGraph(bundle));
    const objects = graph.order;
    const edges = graph.size;

    syncVocabLayer(
      graph,
      buildVocabGraphLayer(bundle, [THREAT_ID, OBJECTIVE_ID], vocabIndex),
    );

    expect(graph.order).toBe(objects + 1);
    expect(graph.size).toBeGreaterThan(edges);
    expect(graph.getNodeAttribute(vocabId, "objectType")).toBe("vocab");
    expect(graph.hasEdge(`${THREAT_ID}|${vocabId}|vocab`)).toBe(true);
    const threat = graph.getNodeAttributes(THREAT_ID);
    const vocab = graph.getNodeAttributes(vocabId);
    expect(Math.hypot(vocab.x - threat.x, vocab.y - threat.y)).toBeLessThan(
      1.1,
    );
  });

  it("drops what the layer no longer has and leaves object positions alone", () => {
    const bundle = threatBundle();
    const graph = toGraphology(buildCorpusGraph(bundle));
    graph.mergeNodeAttributes(THREAT_ID, { x: 40, y: -12 });
    const before = graph.order;

    syncVocabLayer(
      graph,
      buildVocabGraphLayer(bundle, [THREAT_ID], vocabIndex),
    );
    syncVocabLayer(graph, { nodes: [], edges: [] });

    expect(graph.order).toBe(before);
    expect(graph.hasNode(vocabId)).toBe(false);
    expect(graph.getNodeAttribute(THREAT_ID, "x")).toBe(40);
    expect(graph.getNodeAttribute(THREAT_ID, "y")).toBe(-12);
  });

  it("keeps a vocab node's place across syncs and gives it a base position", () => {
    const bundle = threatBundle();
    const graph = toGraphology(buildCorpusGraph(bundle));
    graph.mergeNodeAttributes(THREAT_ID, { baseX: 3, baseY: 4 });
    const layer = buildVocabGraphLayer(bundle, [THREAT_ID], vocabIndex);

    syncVocabLayer(graph, layer);
    const first = graph.getNodeAttributes(vocabId);
    graph.mergeNodeAttributes(vocabId, { x: 99 });
    syncVocabLayer(graph, layer);

    expect(graph.getNodeAttribute(vocabId, "x")).toBe(99);
    expect(typeof first.baseX).toBe("number");
    expect(Math.hypot(first.baseX - 3, first.baseY - 4)).toBeLessThan(1.1);
  });
});
