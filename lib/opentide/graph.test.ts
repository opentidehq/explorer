import { describe, expect, it } from "vitest";
import {
  chainResolver,
  chainingLinkRowKey,
  chainingNeighbors,
  chainsTabData,
  childs,
  createGraphContext,
  getType,
  inboundChainingSources,
  keepActiveRules,
  parents,
  relationsList,
  ruleDetectionSources,
  ruleMapsViaSignal,
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
    expect(childs(ctx, OBJECTIVE_ID)).toContain(SIGNAL_ID);
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

  it("collects chaining neighbors for a threat", () => {
    const neighbors = chainingNeighbors(ctx, THREAT_ID);
    expect(neighbors).toContain("d24f2b4a-80fc-4ee7-9293-3f6e9e3bbbe4");
    expect(neighbors).not.toContain(THREAT_ID);
  });

  it("builds deduped chains tab rows without inbound or transitive dupes", () => {
    const PARENT = "d5039f2c-9fcc-4ba3-ad6a-da8c891ba745";
    const CHILD = "86f62c3a-6556-4a64-a9f5-a79168ad42d9";
    const GRANDCHILD = "cce22952-735a-4255-8319-e5e44aef9d85";
    const SPEAR = "dd5d942c-bac4-4000-b9a6-ca4fef6cfb84";

    const parent: ObjectBody = {
      name: "Abuse of Windows Utilities",
      metadata: { uuid: PARENT, schema: "threat::1.0" },
      threat: {},
    };
    const child: ObjectBody = {
      name: "Abuse Windows Utilities to Side-Load Malicious DLLs",
      metadata: { uuid: CHILD, schema: "threat::1.0" },
      threat: {
        chaining: [
          {
            relation: "atomicity::implements",
            vector: PARENT,
          },
        ],
      },
    };
    const grandchild: ObjectBody = {
      name: "Windows startup folder abused by malware",
      metadata: { uuid: GRANDCHILD, schema: "threat::1.0" },
      threat: {
        chaining: [
          {
            relation: "sequence::succeeds",
            vector: SPEAR,
          },
          {
            relation: "atomicity::implements",
            vector: CHILD,
          },
        ],
      },
    };

    const chainCtx = createGraphContext({
      models: {
        threat: { [PARENT]: parent, [CHILD]: child, [GRANDCHILD]: grandchild },
        objective: {},
        signal: {},
        rule: {},
      },
      flatIndex: { [PARENT]: parent, [CHILD]: child, [GRANDCHILD]: grandchild },
      chaining: {
        [CHILD]: { "atomicity::implements": [PARENT] },
        [GRANDCHILD]: {
          "sequence::succeeds": [SPEAR],
          "atomicity::implements": [CHILD],
        },
      },
    });

    const childLinks = (child.threat as ObjectBody)
      .chaining as Array<ObjectBody>;
    const childTab = chainsTabData(chainCtx, CHILD, childLinks);
    expect(childTab.count).toBe(1);
    expect(childTab.relatedChainIds).toEqual([]);

    const grandchildLinks = (grandchild.threat as ObjectBody)
      .chaining as Array<ObjectBody>;
    const grandchildTab = chainsTabData(chainCtx, GRANDCHILD, grandchildLinks);
    expect(grandchildTab.count).toBe(2);
    expect(grandchildTab.relatedChainIds).not.toContain(PARENT);

    const parentTab = chainsTabData(chainCtx, PARENT, []);
    expect(parentTab.relatedChainIds).toContain(CHILD);
    expect(parentTab.relatedChainIds).not.toContain(GRANDCHILD);
    expect(inboundChainingSources(chainCtx, PARENT)).toEqual([CHILD]);
  });

  it("preserves duplicate chaining links and yields unique row keys", () => {
    const vector = "2d7ed070-e5c5-4796-b150-ea1d02ed1785";
    const links: Array<ObjectBody> = [
      {
        relation: "atomicity::implemented",
        vector,
        description: "First entry",
      },
      {
        relation: "atomicity::implemented",
        vector,
        description: "Duplicate relation+vector",
      },
    ];

    const tab = chainsTabData(ctx, THREAT_ID, links);
    expect(tab.chainingLinks).toHaveLength(2);
    expect(tab.count).toBe(2);

    const keys = tab.chainingLinks.map((link, index) =>
      chainingLinkRowKey(link, index),
    );
    expect(new Set(keys).size).toBe(2);
  });

  it("routes signal-mapped rules through their signal parent", () => {
    expect(ruleMapsViaSignal(ctx, SIGNAL_RULE_ID, OBJECTIVE_ID)).toBe(
      SIGNAL_ID,
    );
    expect(ruleMapsViaSignal(ctx, RULE_ID, OBJECTIVE_ID)).toBeNull();

    expect(ruleDetectionSources(ctx, SIGNAL_RULE_ID)).toEqual([
      { sourceId: SIGNAL_ID, label: "rule" },
    ]);
    expect(ruleDetectionSources(ctx, RULE_ID)).toEqual([
      { sourceId: OBJECTIVE_ID, label: "detects" },
    ]);
  });
});
