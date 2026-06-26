import { describe, expect, it } from "vitest";
import {
  chainResolver,
  childs,
  createGraphContext,
  getType,
  keepActiveRules,
  parents,
  relationsList,
  techniquesResolver,
} from "./graph";
import type { ModelsIndex, ObjectBody } from "./types";

const THREAT_ID = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";
const RULE_ID = "bfae62bb-7ce1-46cd-a131-39803832fa9d";
const SIGNAL_RULE_ID = "c1ae62bb-7ce1-46cd-a131-39803832fa9e";

function makeFixture(): {
  models: ModelsIndex;
  flatIndex: Record<string, ObjectBody>;
  chaining: Record<string, Record<string, string[]>>;
} {
  const threat: ObjectBody = {
    name: "Shai-Hulud",
    metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
    threat: {
      "att&ck": ["T1195.001", "T1059.007"],
      chaining: [
        {
          relation: "atomicity::implements",
          vector: "d24f2b4a-80fc-4ee7-9293-3f6e9e3bbbe4",
        },
      ],
    },
  };

  const objective: ObjectBody = {
    name: "Detect Shai-Hulud",
    metadata: { uuid: OBJECTIVE_ID, schema: "objective::1.0" },
    objective: {
      threats: [THREAT_ID],
      signals: [{ uuid: SIGNAL_ID, name: "Install anomaly" }],
    },
  };

  const signal: ObjectBody = {
    name: "Package Manager Install",
    metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
  };

  const rule: ObjectBody = {
    name: "Shai-Hulud Rule",
    metadata: { uuid: RULE_ID, schema: "rule::1.0" },
    detection_model: OBJECTIVE_ID,
    configurations: {
      defender_for_endpoint: { status: "PRODUCTION" },
    },
  };

  const signalRule: ObjectBody = {
    name: "Shai-Hulud Signal Rule",
    metadata: { uuid: SIGNAL_RULE_ID, schema: "rule::1.0" },
    detection_model: SIGNAL_ID,
    configurations: {
      sentinel: { status: "STAGING" },
    },
  };

  const models: ModelsIndex = {
    threat: { [THREAT_ID]: threat },
    objective: { [OBJECTIVE_ID]: objective },
    signal: { [SIGNAL_ID]: signal },
    rule: { [RULE_ID]: rule, [SIGNAL_RULE_ID]: signalRule },
  };

  const flatIndex = {
    [THREAT_ID]: threat,
    [OBJECTIVE_ID]: objective,
    [SIGNAL_ID]: signal,
    [RULE_ID]: rule,
    [SIGNAL_RULE_ID]: signalRule,
  };

  const chaining = {
    [THREAT_ID]: {
      "atomicity::implements": ["d24f2b4a-80fc-4ee7-9293-3f6e9e3bbbe4"],
    },
  };

  return { models, flatIndex, chaining };
}

describe("graph engine", () => {
  const fixture = makeFixture();
  const ctx = createGraphContext(fixture);

  it("resolves object types from schema", () => {
    expect(getType(ctx, THREAT_ID)).toBe("threat");
    expect(getType(ctx, OBJECTIVE_ID)).toBe("objective");
    expect(getType(ctx, SIGNAL_ID)).toBe("signal");
    expect(getType(ctx, RULE_ID)).toBe("rule");
  });

  it("walks parent relationships", () => {
    expect(parents(ctx, OBJECTIVE_ID)).toEqual([THREAT_ID]);
    expect(parents(ctx, SIGNAL_ID)).toEqual([OBJECTIVE_ID]);
    expect(parents(ctx, RULE_ID)).toEqual([OBJECTIVE_ID]);
    expect(parents(ctx, THREAT_ID)).toEqual([]);
  });

  it("walks child relationships", () => {
    expect(childs(ctx, THREAT_ID)).toContain(OBJECTIVE_ID);
    expect(childs(ctx, OBJECTIVE_ID)).toContain(RULE_ID);
    expect(childs(ctx, SIGNAL_ID)).toContain(SIGNAL_RULE_ID);
  });

  it("resolves techniques recursively", () => {
    expect(techniquesResolver(ctx, RULE_ID)).toEqual([
      "T1195.001",
      "T1059.007",
    ]);
    expect(techniquesResolver(ctx, THREAT_ID)).toEqual([
      "T1195.001",
      "T1059.007",
    ]);
  });

  it("filters deprecated rules", () => {
    const deprecatedRule = "deprecated-rule";
    fixture.models.rule[deprecatedRule] = {
      metadata: { uuid: deprecatedRule, schema: "rule::1.0" },
      detection_model: OBJECTIVE_ID,
      configurations: {
        sentinel: { status: "deprecated" },
      },
    };
    fixture.flatIndex[deprecatedRule] = fixture.models.rule[deprecatedRule]!;

    const active = keepActiveRules(ctx, [RULE_ID, deprecatedRule]);
    expect(active).toEqual([RULE_ID]);
  });

  it("builds flat relation lists", () => {
    const rel = relationsList(ctx, THREAT_ID, "flat", "downstream");
    expect(rel["objective"]).toContain(OBJECTIVE_ID);
    expect(rel["rule"]).toContain(RULE_ID);
  });

  it("counts relations", () => {
    const counts = relationsList(ctx, THREAT_ID, "count", "downstream");
    expect(counts["objective"]).toBeGreaterThan(0);
  });

  it("resolves chaining graph", () => {
    const chain = chainResolver(ctx, THREAT_ID);
    expect(chain[THREAT_ID]?.["atomicity::implements"]).toContain(
      "d24f2b4a-80fc-4ee7-9293-3f6e9e3bbbe4",
    );
  });
});
