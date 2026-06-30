import { describe, expect, it } from "vitest";
import {
  ATTACK_MATRIX_KINDS,
  buildAttackMatrixModel,
  coverageCountsForTechnique,
  detectAttackVersionLabel,
  isTechniqueCovered,
  parseAttackMatrix,
  resolveObjectTechniques,
  techniquesForTactic,
} from "@/lib/graph/attack-mapping";
import { createGraphContext } from "@/lib/opentide/graph";
import type { ModelsIndex, ObjectBody } from "@/lib/opentide/types";
import type { VocabIndex } from "@/lib/opentide/vocab";

const THREAT_ID = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";
const RULE_ID = "bfae62bb-7ce1-46cd-a131-39803832fa9d";

function makeFixture() {
  const models: ModelsIndex = {
    threat: {
      [THREAT_ID]: {
        name: "Shai-Hulud",
        metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
        threat: { "att&ck": ["T1195.001", "T1059.007"] },
      },
    },
    objective: {
      [OBJECTIVE_ID]: {
        name: "Detect Shai-Hulud",
        metadata: { uuid: OBJECTIVE_ID, schema: "objective::1.0" },
        objective: { threats: [THREAT_ID] },
      },
    },
    signal: {
      [SIGNAL_ID]: {
        name: "Package Manager Install",
        metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
        parent: OBJECTIVE_ID,
      },
    },
    rule: {
      [RULE_ID]: {
        name: "Shai-Hulud Rule",
        metadata: { uuid: RULE_ID, schema: "rule::1.0" },
        detection_model: OBJECTIVE_ID,
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
      techniques: ["T1195.001", "T1059.007"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: OBJECTIVE_ID,
      type: "objective" as const,
      name: "Detect Shai-Hulud",
      techniques: ["T1195.001", "T1059.007"],
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
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: RULE_ID,
      type: "rule" as const,
      name: "Shai-Hulud Rule",
      techniques: ["T1195.001", "T1059.007"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
  ];

  const vocabIndex: VocabIndex = {
    "att&ck": {
      "T1195.001": {
        name: "[Enterprise] Supply Chain Compromise: Compromise Software Dependencies",
        stages: ["Initial Access"],
        link: "https://attack.mitre.org/versions/v16/techniques/T1195/001/",
      },
      "T1059.007": {
        name: "[Enterprise] Command and Scripting Interpreter: JavaScript",
        stages: ["Execution"],
      },
      T1548: {
        name: "Abuse Elevation Control Mechanism",
        stages: ["Defense Evasion", "Privilege Escalation"],
        link: "https://attack.mitre.org/techniques/T1548",
      },
      T0800: {
        name: "Industrial : Activate Firmware Update Mode",
        stages: ["Inhibit Response Function"],
        link: "https://attack.mitre.org/techniques/T0800",
      },
      T1626: {
        name: "Mobile : Abuse Elevation Control Mechanism",
        stages: ["Privilege Escalation"],
        link: "https://attack.mitre.org/techniques/T1626",
      },
    },
  };

  const ctx = createGraphContext({ models, flatIndex, chaining: {} });
  const visibleIds = new Set(summaries.map((s) => s.uuid));

  return { ctx, summaries, visibleIds, vocabIndex };
}

describe("resolveObjectTechniques", () => {
  it("inherits objective techniques for signals", () => {
    const { ctx, summaries } = makeFixture();
    const signal = summaries.find((s) => s.type === "signal")!;
    expect(resolveObjectTechniques(ctx, signal)).toEqual([
      "T1195.001",
      "T1059.007",
    ]);
  });

  it("inherits via detection chain for rules", () => {
    const { ctx, summaries } = makeFixture();
    const rule = summaries.find((s) => s.type === "rule")!;
    expect(resolveObjectTechniques(ctx, rule)).toEqual([
      "T1195.001",
      "T1059.007",
    ]);
  });
});

describe("parseAttackMatrix", () => {
  it("reads matrix from bracket prefix, colon prefix, and link path", () => {
    const { vocabIndex } = makeFixture();
    expect(parseAttackMatrix(vocabIndex["att&ck"]!["T1195.001"]!)).toBe(
      "Enterprise",
    );
    expect(parseAttackMatrix(vocabIndex["att&ck"]!["T0800"]!)).toBe("ICS");
    expect(parseAttackMatrix(vocabIndex["att&ck"]!["T1626"]!)).toBe("Mobile");
    expect(
      parseAttackMatrix({
        name: "[ICS] Legacy bracket prefix",
        link: "https://attack.mitre.org/techniques/ics/T0800/",
      }),
    ).toBe("ICS");
    expect(
      parseAttackMatrix({
        name: "Plain technique",
        link: "https://attack.mitre.org/techniques/mobile/T1406/",
      }),
    ).toBe("Mobile");
  });
});

describe("buildAttackMatrixModel", () => {
  it("groups techniques by tactic stages and maps all object roles", () => {
    const { ctx, summaries, visibleIds, vocabIndex } = makeFixture();
    const model = buildAttackMatrixModel(
      ctx,
      summaries,
      visibleIds,
      vocabIndex,
      "Enterprise",
    );

    expect(model.matrix).toBe("Enterprise");
    expect(model.tactics).toContain("initial-access");
    expect(model.tactics).toContain("execution");
    expect(model.tactics.indexOf("initial-access")).toBeLessThan(
      model.tactics.indexOf("execution"),
    );

    const supplyChain = model.techniqueById.get("T1195.001");
    expect(supplyChain?.objects.map((o) => o.role).sort()).toEqual([
      "objective",
      "rule",
      "signal",
      "threat",
    ]);
    expect(coverageCountsForTechnique(supplyChain!)).toEqual({
      threat: 1,
      objective: 1,
      signal: 1,
      rule: 1,
    });
    expect(isTechniqueCovered(supplyChain!)).toBe(true);

    const initialAccess = techniquesForTactic(model, "initial-access");
    expect(initialAccess.map((t) => t.techniqueId)).toEqual(["T1195.001"]);

    const defenseEvasion = techniquesForTactic(model, "defense-evasion");
    expect(defenseEvasion.some((t) => t.techniqueId === "T1548")).toBe(true);
    const privilegeEscalation = techniquesForTactic(
      model,
      "privilege-escalation",
    );
    expect(privilegeEscalation.some((t) => t.techniqueId === "T1548")).toBe(
      true,
    );

    const uncovered = model.techniqueById.get("T1548");
    expect(uncovered?.objects).toHaveLength(0);
    expect(isTechniqueCovered(uncovered!)).toBe(false);
  });

  it("separates Enterprise, ICS, and Mobile matrices", () => {
    const { ctx, summaries, visibleIds, vocabIndex } = makeFixture();
    const enterprise = buildAttackMatrixModel(
      ctx,
      summaries,
      visibleIds,
      vocabIndex,
      "Enterprise",
    );
    const ics = buildAttackMatrixModel(
      ctx,
      summaries,
      visibleIds,
      vocabIndex,
      "ICS",
    );
    const mobile = buildAttackMatrixModel(
      ctx,
      summaries,
      visibleIds,
      vocabIndex,
      "Mobile",
    );

    expect(enterprise.techniqueById.has("T0800")).toBe(false);
    expect(enterprise.techniqueById.has("T1626")).toBe(false);
    expect(ics.techniqueById.has("T0800")).toBe(true);
    expect(ics.techniqueById.has("T1195.001")).toBe(false);
    expect(ics.techniqueById.has("T1626")).toBe(false);
    expect(ics.tactics).toContain("inhibit-response-function");
    expect(mobile.techniqueById.has("T1626")).toBe(true);
    expect(mobile.techniqueById.has("T0800")).toBe(false);
    expect(mobile.techniqueById.has("T1195.001")).toBe(false);
    expect(mobile.tactics).toContain("privilege-escalation");
  });

  it("exposes all supported matrix kinds", () => {
    expect(ATTACK_MATRIX_KINDS).toEqual(["Enterprise", "ICS", "Mobile"]);
  });

  it("classifies OpenTide Industrial/Mobile colon prefixes from production vocab shape", () => {
    const productionShape: VocabIndex = {
      "att&ck": {
        T0800: {
          name: "Industrial : Activate Firmware Update Mode",
          stages: ["Inhibit Response Function"],
          link: "https://attack.mitre.org/techniques/T0800",
        },
        T1626: {
          name: "Mobile : Abuse Elevation Control Mechanism",
          stages: ["Privilege Escalation"],
          link: "https://attack.mitre.org/techniques/T1626",
        },
        T1548: {
          name: "Abuse Elevation Control Mechanism",
          stages: ["Defense Evasion", "Privilege Escalation"],
          link: "https://attack.mitre.org/techniques/T1548",
        },
      },
    };

    const { ctx } = makeFixture();
    const empty = buildAttackMatrixModel(
      ctx,
      [],
      new Set(),
      productionShape,
      "Enterprise",
    );
    const ics = buildAttackMatrixModel(
      ctx,
      [],
      new Set(),
      productionShape,
      "ICS",
    );
    const mobile = buildAttackMatrixModel(
      ctx,
      [],
      new Set(),
      productionShape,
      "Mobile",
    );

    expect(ics.techniqueById.size).toBe(1);
    expect(mobile.techniqueById.size).toBe(1);
    expect(empty.techniqueById.size).toBe(1);
    expect(ics.techniqueById.get("T0800")?.name).toBe(
      "Activate Firmware Update Mode",
    );
    expect(mobile.techniqueById.get("T1626")?.name).toBe(
      "Abuse Elevation Control Mechanism",
    );
  });

  it("groups into multiple tactic columns when stages are only on compound keys", () => {
    const { ctx, summaries, visibleIds } = makeFixture();
    const strippedVocab: VocabIndex = {
      "att&ck": {
        "T1195.001": {
          name: "[Enterprise] Supply Chain Compromise: Compromise Software Dependencies",
          link: "https://attack.mitre.org/versions/v16/techniques/T1195/001/",
        },
        "Initial Access::T1195.001": {
          name: "[Enterprise] Supply Chain Compromise: Compromise Software Dependencies",
          link: "https://attack.mitre.org/versions/v16/techniques/T1195/001/",
        },
        "T1059.007": {
          name: "[Enterprise] Command and Scripting Interpreter: JavaScript",
        },
        "Execution::T1059.007": {
          name: "[Enterprise] Command and Scripting Interpreter: JavaScript",
        },
        T1548: {
          name: "Abuse Elevation Control Mechanism",
          link: "https://attack.mitre.org/techniques/T1548",
        },
        "Defense Evasion::T1548": {
          name: "Abuse Elevation Control Mechanism",
          link: "https://attack.mitre.org/techniques/T1548",
        },
        "Privilege Escalation::T1548": {
          name: "Abuse Elevation Control Mechanism",
          link: "https://attack.mitre.org/techniques/T1548",
        },
      },
    };

    const model = buildAttackMatrixModel(
      ctx,
      summaries,
      visibleIds,
      strippedVocab,
      "Enterprise",
    );

    expect(model.tactics.length).toBeGreaterThan(1);
    expect(model.tactics).toContain("initial-access");
    expect(model.tactics).toContain("execution");
    expect(model.tactics).toContain("defense-evasion");
    expect(model.tactics).toContain("privilege-escalation");
    expect(model.techniqueById.get("T1548")?.description).toBeUndefined();
  });
});

describe("detectAttackVersionLabel", () => {
  it("reads MITRE version from vocab links", () => {
    const { vocabIndex } = makeFixture();
    expect(detectAttackVersionLabel(vocabIndex)).toBe("v16");
  });
});
