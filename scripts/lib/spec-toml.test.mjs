import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFieldRegistryFromPins,
  buildVocabIndexFromDir,
  comparePinVersions,
  parseVocabDocument,
  pathToLabel,
  signalPathFromObjectivePin,
  vocabRefToStem,
} from "./spec-toml.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SPECS = path.resolve(ROOT, "../specifications");

describe("spec-toml", () => {
  it("parses vocab ref stems", () => {
    expect(vocabRefToStem("severity::1.0")).toBe("severity");
    expect(vocabRefToStem("detection.composition::1.0")).toBe(
      "detection.composition",
    );
  });

  it("compares pin versions", () => {
    expect(comparePinVersions("2.1", "1.0")).toBeGreaterThan(0);
    expect(comparePinVersions("1.0", "1.0")).toBe(0);
  });

  it("builds chaining compound vocab keys", () => {
    const doc = {
      keys: [
        {
          name: "synergize",
          "tide.vocab.stages": "support",
          description: "Both TVMs support each other",
        },
      ],
    };
    const { index } = parseVocabDocument(doc, "chaining_relations.vocab");
    expect(index.synergize?.description).toContain("support");
    expect(index["support::synergize"]?.name).toBe("synergize");
  });

  it("indexes actor ids and stage-prefixed keys", () => {
    const doc = {
      keys: [
        {
          id: "G0009",
          name: "[Enterprise] Deep Panda",
          link: "https://attack.mitre.org/groups/G0009",
          description: "Suspected Chinese threat group.",
          alias: ["Shell Crew", "G0009"],
          "tide.vocab.stages": "att&ck",
        },
        {
          id: "066d25c1-71bd-4bd4-8ca7-edbba00063f4",
          name: "APT19",
          description: "Financial and technology targeting.",
          alias: ["DEEP PANDA"],
          "tide.vocab.stages": "misp",
        },
      ],
    };
    const { index } = parseVocabDocument(doc, "actors.vocab");
    expect(index["att&ck::G0009"]?.name).toBe("[Enterprise] Deep Panda");
    expect(index["att&ck::G0009"]?.link).toContain("G0009");
    expect(index["misp::066d25c1-71bd-4bd4-8ca7-edbba00063f4"]?.name).toBe(
      "APT19",
    );
    expect(index["att&ck::Shell Crew"]?.name).toBe("[Enterprise] Deep Panda");
  });

  it("indexes ATT&CK tactic arrays on technique terms", () => {
    const doc = {
      keys: [
        {
          id: "T1548",
          name: "Abuse Elevation Control Mechanism",
          "tide.vocab.stages": ["Defense Evasion", "Privilege Escalation"],
          link: "https://attack.mitre.org/techniques/T1548",
        },
      ],
    };
    const { index } = parseVocabDocument(doc, "att&ck.vocab");
    expect(index.T1548?.stages).toEqual([
      "Defense Evasion",
      "Privilege Escalation",
    ]);
    expect(index.T1548?.stage).toBe("Defense Evasion");
    expect(index["Defense Evasion::T1548"]?.name).toBe(
      "Abuse Elevation Control Mechanism",
    );
  });

  it("maps objective signal pins to signal paths", () => {
    expect(signalPathFromObjectivePin("objective.signals.severity")).toBe(
      "severity",
    );
    expect(
      signalPathFromObjectivePin("objective.signals.data.logsources"),
    ).toBe("data.logsources");
  });

  it("labels threat surface pin as Surface", () => {
    expect(pathToLabel("threat.surface")).toBe("Surface");
  });

  it("builds vocab index from specifications when present", () => {
    const vocabDir = path.join(SPECS, "vocabularies");
    if (!fs.existsSync(vocabDir)) return;

    const index = buildVocabIndexFromDir(vocabDir);
    expect(Object.keys(index).length).toBeGreaterThan(20);
    expect(index.severity?.["Localised incident"]?.name).toBe(
      "Localised incident",
    );
    expect(index.chaining_relations?.["support::synergize"]).toBeDefined();
  });

  it("builds field registry from pin tables when present", () => {
    const pinsDir = path.join(SPECS, "schemas/pins");
    if (!fs.existsSync(pinsDir)) return;

    const registry = buildFieldRegistryFromPins(pinsDir);
    expect(registry.threat?.some((f) => f.path === "threat.surface")).toBe(
      true,
    );
    expect(
      registry.threat?.find((f) => f.path === "threat.surface")?.label,
    ).toBe("Surface");
    expect(registry.threat?.some((f) => f.path === "threat.chaining")).toBe(
      false,
    );
    expect(registry.signal?.some((f) => f.path === "severity")).toBe(true);
    expect(registry.rule?.some((f) => f.path === "metadata.author")).toBe(true);
    expect(registry.rule?.some((f) => f.path === "description")).toBe(true);
    expect(registry.rule?.some((f) => f.path === "techniques")).toBe(true);
    expect(registry.rule?.some((f) => f.path === "criticality")).toBe(false);
  });
});
