import { describe, expect, it } from "vitest";
import { buildCorpusGraph } from "@/lib/graph/corpus-graph";
import { enrichBundle } from "@/lib/opentide/enrich-bundle";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  ObjectBody,
} from "@/lib/opentide/types";
import type { VocabIndex } from "@/lib/opentide/vocab";
import {
  buildDisplayGraph,
  buildVocabGraphLayer,
  collectObjectVocabReferences,
  expandVisibleIdsWithVocab,
  isVocabNodeId,
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

describe("buildDisplayGraph", () => {
  it("returns the base graph when vocab layer is disabled", () => {
    const bundle = enrichBundle(
      makeThreatBundle({
        name: "Test Threat",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { severity: "High" },
      }),
    );
    const corpus = buildCorpusGraph(bundle);

    const graph = buildDisplayGraph(
      corpus,
      bundle,
      new Set([THREAT_ID]),
      false,
      vocabIndex,
    );

    expect(graph).toBe(corpus.graphology);
    expect(graph.order).toBe(corpus.graphology.order);
  });

  it("copies the corpus graph without duplicate edge key errors", () => {
    const bundle = enrichBundle(
      makeLinkedThreatObjectiveBundle({
        name: "Test Threat",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { severity: "High" },
      }),
    );
    const corpus = buildCorpusGraph(bundle);
    const visible = new Set([THREAT_ID, OBJECTIVE_ID]);

    expect(corpus.graphology.size).toBeGreaterThan(1);

    const graph = buildDisplayGraph(corpus, bundle, visible, true, vocabIndex);

    expect(graph.order).toBeGreaterThan(corpus.graphology.order);
    expect(graph.hasNode(vocabNodeId("severity", "High"))).toBe(true);
    expect(graph.size).toBeGreaterThan(corpus.graphology.size);
  });

  it("adds vocab nodes when enabled", () => {
    const bundle = enrichBundle(
      makeThreatBundle({
        name: "Test Threat",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { severity: "High" },
      }),
    );
    const corpus = buildCorpusGraph(bundle);
    const vocabId = vocabNodeId("severity", "High");

    const graph = buildDisplayGraph(
      corpus,
      bundle,
      new Set([THREAT_ID]),
      true,
      vocabIndex,
    );

    expect(graph.order).toBe(corpus.graphology.order + 1);
    expect(graph.hasNode(vocabId)).toBe(true);
    expect(graph.getNodeAttribute(vocabId, "objectType")).toBe("vocab");
    expect(graph.hasEdge(`${THREAT_ID}|${vocabId}|vocab`)).toBe(true);
  });
});
