import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleBundle,
  buildStagingIndex,
  getStatus,
  inferType,
  loadStatusStrategies,
} from "./generate-mock-bundle.mjs";

const THREAT = "00000000-0000-4000-8000-000000000001";
const OBJECTIVE = "00000000-0000-4000-8000-000000000002";
const SIGNAL = "00000000-0000-4000-8000-000000000003";
const CHILD_SIGNAL = "00000000-0000-4000-8000-000000000004";
const RULE = "00000000-0000-4000-8000-000000000005";

/**
 * @param {string} uuid
 * @param {string} schema
 * @param {Record<string, unknown>} fields
 */
const object = (uuid, schema, fields) => ({
  file: `${uuid}.yaml`,
  path: `objects/${uuid}.yaml`,
  body: { name: uuid, metadata: { uuid, schema }, ...fields },
});

/** A spec-valid corpus: a rule written only with the spec's top-level fields. */
const corpus = [
  object(THREAT, "threat::1.0", { threat: { mitre_attack: ["T1110"] } }),
  object(OBJECTIVE, "objective::1.0", {
    objective: {
      threats: [THREAT],
      signals: [
        { uuid: SIGNAL, name: "Spray" },
        { uuid: CHILD_SIGNAL, name: "Spray from one host", parent: SIGNAL },
      ],
    },
  }),
  object(RULE, "rule::1.0", {
    status: "STAGING",
    techniques: ["T1059.001"],
    detection_model: CHILD_SIGNAL,
    platforms: { splunk: { query: "index=auth" } },
  }),
];

const bundle = assembleBundle(corpus, { generatedAt: "" });
const summary = (/** @type {string} */ uuid) =>
  bundle.summaries.find((s) => s.uuid === uuid);

describe("assembleBundle", () => {
  it("keeps a signal's own parent and files its objective apart", () => {
    expect(bundle.flatIndex[CHILD_SIGNAL]).toMatchObject({
      parent: SIGNAL,
      _objective: OBJECTIVE,
    });
    expect(bundle.flatIndex[SIGNAL].parent).toBeUndefined();
    expect(summary(CHILD_SIGNAL)?.path).toBe(`objects/${OBJECTIVE}.yaml`);
  });

  it("gives signals the techniques of their objective", () => {
    expect(summary(SIGNAL)?.techniques).toEqual(["T1110"]);
  });

  it("reads a rule's top-level status, techniques and legacy platforms", () => {
    expect(summary(RULE)).toMatchObject({
      status: "STAGING",
      techniques: ["T1059.001", "T1110"],
      platforms: ["splunk"],
    });
    expect(bundle.stagingIndex.deployments[RULE]).toEqual({
      splunk: "STAGING",
    });
    expect(bundle.stagingIndex.stagingObjects).toEqual([RULE]);
  });

  it("counts a signal's objective as its relation", () => {
    expect(summary(SIGNAL)?.relatedCount).toBe(1);
    expect(summary(OBJECTIVE)?.relatedCount).toBe(3);
  });
});

describe("inferType", () => {
  it("reads the schema, and falls back to the fields a type has", () => {
    expect(inferType({ metadata: { schema: "objective::1.1" } })).toBe(
      "objective",
    );
    expect(inferType({ platforms: { splunk: {} } })).toBe("rule");
    expect(inferType({ threat: {} })).toBe("threat");
    expect(inferType({})).toBeNull();
  });
});

describe("getStatus", () => {
  /**
   * @param {Record<string, unknown>} configurations
   * @param {string} [status]
   */
  const rule = (configurations, status) => ({ status, configurations });

  it("shows the enabled block that deploys furthest", () => {
    const body = rule({
      sentinel: { enabled: true, status: "DEVELOPMENT" },
      splunk: { enabled: true, status: "PRODUCTION" },
      crowdstrike: { enabled: true, status: "DESIGN" },
    });
    expect(getStatus(body, "rule")).toBe("PRODUCTION");
  });

  it("passes over disabled blocks while an enabled one is left", () => {
    const body = rule({
      sentinel: { enabled: false, status: "PRODUCTION" },
      splunk: { enabled: true, status: "ACCEPTANCE" },
    });
    expect(getStatus(body, "rule")).toBe("ACCEPTANCE");
  });

  it("falls back to the rule's status, then the spec default", () => {
    expect(getStatus(rule({ splunk: {} }, "improving"), "rule")).toBe(
      "IMPROVING",
    );
    expect(getStatus({}, "rule")).toBe("STAGING");
    expect(getStatus({}, "threat")).toBeUndefined();
  });
});

describe("buildStagingIndex", () => {
  it("sorts blocks by their status's strategy, not its name", () => {
    const index = buildStagingIndex([
      [
        "a",
        {
          configurations: {
            sentinel: { enabled: true, status: "DEVELOPMENT" },
            splunk: { enabled: true, status: "PRODUCTION" },
          },
        },
      ],
      ["b", { configurations: { sentinel: { status: "DISABLED" } } }],
      [
        "c",
        {
          configurations: {
            sentinel: { enabled: false, status: "STAGING" },
          },
        },
      ],
      ["d", { configurations: { splunk: { status: "MADE_UP" } } }],
    ]);
    expect(index.stagingObjects).toEqual(["a"]);
    expect(index.productionObjects).toEqual(["a"]);
    expect(index.platformSummary).toEqual({
      sentinel: { production: 0, staging: 1, other: 2 },
      splunk: { production: 1, staging: 0, other: 1 },
    });
    expect(index.deployments.c).toEqual({ sentinel: "STAGING" });
  });

  it("deploys a UNIVERSAL status to staging and production", () => {
    const index = buildStagingIndex(
      [["a", { configurations: { splunk: { status: "EVERYWHERE" } } }]],
      { EVERYWHERE: "UNIVERSAL" },
    );
    expect(index.stagingObjects).toEqual(["a"]);
    expect(index.productionObjects).toEqual(["a"]);
  });
});

describe("loadStatusStrategies", () => {
  it("merges a corpus's deployment.toml over the bundled statuses", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-corpus-"));
    try {
      const dir = path.join(root, ".opentide", "configurations");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "deployment.toml"),
        [
          "[[statuses]]",
          'name = "PILOT"',
          'description = "Both at once"',
          'strategy = "UNIVERSAL"',
          "",
          "[[statuses]]",
          'name = "STAGING"',
          'description = "Not deployed here"',
          'strategy = "INERT"',
        ].join("\n"),
      );
      const strategies = loadStatusStrategies(root);
      expect(strategies.PILOT).toBe("UNIVERSAL");
      expect(strategies.STAGING).toBe("INERT");
      expect(strategies.PRODUCTION).toBe("RELEASE");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the bundled statuses without a corpus file", () => {
    expect(loadStatusStrategies(null).DEVELOPMENT).toBe("PREVIEW");
  });
});
