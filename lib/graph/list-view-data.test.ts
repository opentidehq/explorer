import { describe, expect, it } from "vitest";
import { buildCorpusGraph, getCausalChain } from "@/lib/graph/corpus-graph";
import {
  applyListViewFocus,
  buildListViewModel,
  coverageForObjective,
  coverageForRule,
  coverageForThreat,
  getRelatedIdsForPreview,
} from "@/lib/graph/list-view-data";
import { createGraphContext } from "@/lib/opentide/graph";
import type {
  ExplorerBundle,
  ModelsIndex,
  ObjectBody,
} from "@/lib/opentide/types";

const THREAT_ID = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
const THREAT_B_ID = "69548b96-9b01-414c-badd-c0bf2ab40d9b";
const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const OBJECTIVE_B_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3898";
const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";
const SIGNAL_B_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d964";
const RULE_ID = "bfae62bb-7ce1-46cd-a131-39803832fa9d";
const SIGNAL_RULE_ID = "c1ae62bb-7ce1-46cd-a131-39803832fa9e";

function makeFixture() {
  const models: ModelsIndex = {
    threat: {
      [THREAT_ID]: {
        name: "Shai-Hulud",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { "att&ck": ["T1195.001"] },
      },
      [THREAT_B_ID]: {
        name: "Zeta Threat",
        metadata: { uuid: THREAT_B_ID, schema: "threat::1.0" },
        threat: { "att&ck": ["T1059"] },
      },
    },
    objective: {
      [OBJECTIVE_ID]: {
        name: "Detect Shai-Hulud",
        metadata: { uuid: OBJECTIVE_ID, schema: "objective::1.0" },
        objective: {
          threats: [THREAT_ID],
          signals: [
            { uuid: SIGNAL_ID, name: "Install anomaly" },
            { uuid: SIGNAL_B_ID, name: "Secondary signal" },
          ],
        },
      },
      [OBJECTIVE_B_ID]: {
        name: "Monitor Zeta",
        metadata: { uuid: OBJECTIVE_B_ID, schema: "objective::1.0" },
        objective: { threats: [THREAT_B_ID] },
      },
    },
    signal: {
      [SIGNAL_ID]: {
        name: "Package Manager Install",
        metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
        parent: OBJECTIVE_ID,
      },
      [SIGNAL_B_ID]: {
        name: "Secondary Signal",
        metadata: { uuid: SIGNAL_B_ID, schema: "signal::1.0" },
        parent: OBJECTIVE_ID,
      },
    },
    rule: {
      [RULE_ID]: {
        name: "Objective Rule",
        metadata: { uuid: RULE_ID, schema: "rule::1.0" },
        detection_model: OBJECTIVE_ID,
      },
      [SIGNAL_RULE_ID]: {
        name: "Signal Rule",
        metadata: { uuid: SIGNAL_RULE_ID, schema: "rule::1.0" },
        detection_model: SIGNAL_ID,
      },
    },
  };

  const flatIndex: Record<string, ObjectBody> = {
    ...models.threat,
    ...models.objective,
    ...models.signal,
    ...models.rule,
  };

  const summaries = [
    {
      uuid: THREAT_ID,
      type: "threat" as const,
      name: "Shai-Hulud",
      techniques: ["T1195.001"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: THREAT_B_ID,
      type: "threat" as const,
      name: "Zeta Threat",
      techniques: ["T1059"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: OBJECTIVE_ID,
      type: "objective" as const,
      name: "Detect Shai-Hulud",
      techniques: ["T1195.001"],
      actors: [],
      relatedCount: 2,
      platforms: [],
    },
    {
      uuid: OBJECTIVE_B_ID,
      type: "objective" as const,
      name: "Monitor Zeta",
      techniques: ["T1059"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: SIGNAL_ID,
      type: "signal" as const,
      name: "Package Manager Install",
      techniques: [],
      actors: [],
      relatedCount: 2,
      platforms: [],
    },
    {
      uuid: SIGNAL_B_ID,
      type: "signal" as const,
      name: "Secondary Signal",
      techniques: [],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: RULE_ID,
      type: "rule" as const,
      name: "Objective Rule",
      techniques: ["T1195.001"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: SIGNAL_RULE_ID,
      type: "rule" as const,
      name: "Signal Rule",
      techniques: [],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
  ];

  const ctx = createGraphContext({ models, flatIndex, chaining: {} });
  const visibleIds = new Set(summaries.map((s) => s.uuid));

  const bundle: ExplorerBundle = {
    version: "test",
    generatedAt: "2025-01-01T00:00:00Z",
    models,
    flatIndex,
    chaining: {},
    signals: models.signal ?? {},
    summaries,
  };

  return { ctx, summaries, visibleIds, bundle };
}

describe("buildListViewModel", () => {
  it("builds threat-objective-rule links and nests signals under objectives", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);

    expect(model.threats.map((t) => t.id)).toEqual([THREAT_ID, THREAT_B_ID]);
    expect(model.objectives).toHaveLength(2);
    const primary = model.objectives.find(
      (row) => row.objective.id === OBJECTIVE_ID,
    );
    expect(primary?.signalIds).toEqual([SIGNAL_ID, SIGNAL_B_ID]);
    expect(primary?.ruleIds.sort()).toEqual([RULE_ID, SIGNAL_RULE_ID].sort());
    expect(model.rules).toHaveLength(2);

    const kinds = model.links.map((l) => l.kind);
    expect(kinds).toContain("threat-objective");
    expect(kinds).toContain("objective-signal");
    expect(kinds).toContain("objective-rule");
  });

  it("respects visibleIds filtering", () => {
    const { ctx, summaries } = makeFixture();
    const visibleIds = new Set([THREAT_ID, OBJECTIVE_ID]);
    const model = buildListViewModel(ctx, summaries, visibleIds);

    expect(model.threats).toHaveLength(1);
    expect(model.rules).toHaveLength(0);
    expect(model.links.every((l) => l.kind === "threat-objective")).toBe(true);
  });
});

describe("applyListViewFocus", () => {
  it("keeps all rows and moves focus members to the top", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    const focused = applyListViewFocus(
      model,
      new Set([THREAT_ID, OBJECTIVE_ID, SIGNAL_ID, RULE_ID, SIGNAL_RULE_ID]),
    );

    expect(focused.threats.map((t) => t.id)[0]).toBe(THREAT_ID);
    expect(focused.threats).toHaveLength(2);
    expect(focused.objectives.map((row) => row.objective.id)[0]).toBe(
      OBJECTIVE_ID,
    );
    expect(focused.objectives).toHaveLength(2);
    expect(focused.rules.map((r) => r.id).sort()).toEqual(
      [RULE_ID, SIGNAL_RULE_ID].sort(),
    );
  });

  it("returns the model unchanged when focus is null", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    expect(applyListViewFocus(model, null)).toBe(model);
  });

  it("moves parent objective to top when a signal is in focus", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    const focused = applyListViewFocus(model, new Set([SIGNAL_ID]));

    expect(focused.objectives.map((row) => row.objective.id)[0]).toBe(
      OBJECTIVE_ID,
    );
  });

  it("preserves signal order under an objective when focusing a signal", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    const baselineRow = model.objectives.find(
      (entry) => entry.objective.id === OBJECTIVE_ID,
    );
    const focused = applyListViewFocus(model, new Set([SIGNAL_B_ID]));
    const focusedRow = focused.objectives.find(
      (entry) => entry.objective.id === OBJECTIVE_ID,
    );

    expect(focusedRow?.signalIds).toEqual(baselineRow?.signalIds);
  });
});

describe("getRelatedIdsForPreview", () => {
  it("returns the same node set as getCausalChain for detection paths", () => {
    const { bundle } = makeFixture();
    const corpus = buildCorpusGraph(bundle);
    const expected = getCausalChain(corpus, SIGNAL_RULE_ID).nodes;
    const preview = getRelatedIdsForPreview(corpus, SIGNAL_RULE_ID);
    expect([...preview].toSorted()).toEqual([...expected].toSorted());
    expect(preview.has(THREAT_ID)).toBe(true);
    expect(preview.has(OBJECTIVE_ID)).toBe(true);
    expect(preview.has(SIGNAL_ID)).toBe(true);
    expect(preview.has(SIGNAL_RULE_ID)).toBe(true);
    expect(preview.has(THREAT_B_ID)).toBe(false);
  });
});

describe("coverage helpers", () => {
  it("counts linked objectives and rules for threats", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    expect(coverageForThreat(THREAT_ID, model)).toEqual({
      objective: 1,
      rule: 2,
    });
  });

  it("counts threats, signals, and rules on objective rows", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    const row = model.objectives.find(
      (entry) => entry.objective.id === OBJECTIVE_ID,
    )!;
    expect(coverageForObjective(row)).toEqual({
      threat: 1,
      signal: 2,
      rule: 2,
    });
  });

  it("rolls up chain members for rules", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const model = buildListViewModel(ctx, summaries, visibleIds);
    expect(coverageForRule(RULE_ID, model)).toEqual({
      objective: 1,
      threat: 1,
      signal: 2,
    });
  });
});
