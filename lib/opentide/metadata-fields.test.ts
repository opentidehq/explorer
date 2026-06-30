import { describe, expect, it } from "vitest";
import {
  getAssessmentPaths,
  getMetadataFields,
} from "@/lib/opentide/metadata-fields";
import type { ExplorerBundle, ObjectBody } from "@/lib/opentide/types";
import { createGraphContext } from "@/lib/opentide/graph";

const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";

function makeBundle(): ExplorerBundle {
  const objectiveBody: ObjectBody = {
    name: "Detect Shai-Hulud",
    metadata: {
      uuid: OBJECTIVE_ID,
      schema: "objective::1.0",
      tlp: "TLP:GREEN",
    },
    objective: {
      type: "detection.types::behavioral",
      priority: "criticality::high",
      composition: { strategy: "detection.composition::correlation" },
      "att&ck": ["T1195.001"],
      signals: [{ uuid: SIGNAL_ID, name: "Install anomaly" }],
    },
  };

  const signalBody: ObjectBody = {
    name: "Package Manager Install",
    metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
    severity: "severity::medium",
  };

  return {
    version: "0.1.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
    models: {
      threat: {},
      objective: { [OBJECTIVE_ID]: objectiveBody },
      signal: { [SIGNAL_ID]: signalBody },
      rule: {},
    },
    flatIndex: {
      [OBJECTIVE_ID]: objectiveBody,
      [SIGNAL_ID]: signalBody,
    },
    chaining: {},
    signals: { [SIGNAL_ID]: signalBody },
    summaries: [
      {
        uuid: OBJECTIVE_ID,
        type: "objective",
        name: "Detect Shai-Hulud",
        schema: "objective::1.0",
        tlp: "TLP:GREEN",
        techniques: ["T1195.001"],
        actors: [],
        relatedCount: 1,
        platforms: ["sentinel"],
      },
      {
        uuid: SIGNAL_ID,
        type: "signal",
        name: "Package Manager Install",
        schema: "signal::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
        status: "severity::medium",
      },
    ],
  };
}

describe("getAssessmentPaths", () => {
  it("excludes rule description shown in the Description panel", () => {
    expect(getAssessmentPaths("rule")).not.toContain("description");
    expect(getAssessmentPaths("rule")).toContain("severity");
    expect(getAssessmentPaths("rule")).toContain("response.alert_severity");
  });

  it("keeps threat and signal assessment paths unchanged", () => {
    expect(getAssessmentPaths("threat")).toContain("criticality");
    expect(getAssessmentPaths("signal")).toContain("methodology");
  });
});

describe("getMetadataFields", () => {
  it("inherits objective metadata for signals", () => {
    const bundle = makeBundle();
    const graphContext = createGraphContext(bundle);
    const signalSummary = bundle.summaries.find((s) => s.uuid === SIGNAL_ID)!;
    const signalBody = bundle.flatIndex[SIGNAL_ID]!;

    const { entries, parentObjective, platformsInherited } = getMetadataFields(
      signalSummary,
      signalBody,
      {
        graphContext,
        flatIndex: bundle.flatIndex,
        getSummary: (id) => bundle.summaries.find((s) => s.uuid === id),
      },
    );

    expect(parentObjective).toEqual({
      id: OBJECTIVE_ID,
      name: "Detect Shai-Hulud",
    });
    expect(platformsInherited).toBe(true);
    expect(entries.some((entry) => entry.field.path === "objective.type")).toBe(
      true,
    );
    expect(
      entries.find((entry) => entry.field.path === "objective.type")?.inherited,
    ).toBe(true);
    expect(entries.some((entry) => entry.field.path === "_platforms")).toBe(
      true,
    );
    expect(
      entries.find((entry) => entry.field.path === "metadata.schema")
        ?.inherited,
    ).toBeUndefined();
  });
});
