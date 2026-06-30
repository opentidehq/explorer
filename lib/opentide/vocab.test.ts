import { describe, expect, it } from "vitest";
import {
  findSurfaceTermsInText,
  flattenReferences,
  formatVocabDisplayName,
  lookupVocabTerm,
  normalizeReference,
  parseTerrainMarkdown,
  splitPillValues,
  type VocabIndex,
} from "@/lib/opentide/vocab";

describe("formatVocabDisplayName", () => {
  it("strips bracket and colon matrix prefixes", () => {
    expect(formatVocabDisplayName("[Enterprise] Supply Chain Compromise")).toBe(
      "Supply Chain Compromise",
    );
    expect(
      formatVocabDisplayName("Industrial : Activate Firmware Update Mode"),
    ).toBe("Activate Firmware Update Mode");
    expect(
      formatVocabDisplayName("Mobile : Abuse Elevation Control Mechanism"),
    ).toBe("Abuse Elevation Control Mechanism");
  });
});

describe("parseTerrainMarkdown", () => {
  it("splits narrative from trailing Domains/Targets/Platforms lines", () => {
    const parsed = parseTerrainMarkdown(
      "Narrative prose about the threat.\n\nDomains: Enterprise, Networking\nTargets: Network Equipment\nPlatforms: Windows",
    );
    expect(parsed.narrative).toContain("Narrative prose");
    expect(parsed.scopes).toHaveLength(3);
    expect(parsed.scopes[0]?.values).toEqual(["Enterprise", "Networking"]);
    expect(parsed.scopes[2]?.values).toEqual(["Windows"]);
  });

  it("extracts inline scoped paths from full text", () => {
    const parsed = parseTerrainMarkdown(
      "Applies to OS::Windows::11 and Cloud::AWS::Networking.",
    );
    expect(parsed.inlinePaths).toContain("OS::Windows::11");
    expect(parsed.inlinePaths).toContain("Cloud::AWS::Networking");
  });

  it("extracts scoped paths after scope lines too", () => {
    const parsed = parseTerrainMarkdown(
      "Overview.\nDomains: OS::Linux\nTargets: Cloud::AWS",
    );
    expect(parsed.inlinePaths).toContain("OS::Linux");
    expect(parsed.inlinePaths).toContain("Cloud::AWS");
  });
});

describe("splitPillValues", () => {
  it("deduplicates pill values case-insensitively", () => {
    expect(
      splitPillValues(["att&ck::G0007", "att&ck::G0007", "att&ck::G0016"]),
    ).toEqual(["att&ck::G0007", "att&ck::G0016"]);
  });
});

describe("normalizeReference", () => {
  it("accepts string URLs", () => {
    expect(normalizeReference("https://example.com/doc")).toEqual({
      url: "https://example.com/doc",
      label: "https://example.com/doc",
    });
  });

  it("extracts url and title from objects", () => {
    expect(
      normalizeReference({
        url: "https://example.com/report",
        title: "Annual report",
      }),
    ).toEqual({
      url: "https://example.com/report",
      label: "Annual report",
    });
  });

  it("flattens nested ObjectReferences maps", () => {
    expect(
      flattenReferences({
        public: {
          1: "https://example.com/a",
          2: "https://example.com/b",
        },
      }),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });
});

describe("findSurfaceTermsInText", () => {
  const index: VocabIndex = {
    surface: {
      Windows: { name: "Windows", description: "Microsoft Windows" },
      "OS::Windows::11": {
        name: "OS::Windows::11",
        description: "Windows 11",
      },
      Mobile: { name: "Mobile", description: "Mobile networks" },
    },
  };

  it("matches vocabulary terms mentioned in prose", () => {
    expect(
      findSurfaceTermsInText(
        index,
        "GSM interceptors target Mobile handsets on cellular networks.",
      ),
    ).toContain("Mobile");
  });
});

describe("lookupVocabTerm", () => {
  const index: VocabIndex = {
    surface: {
      Windows: { name: "Windows", description: "Microsoft Windows" },
      "OS::Windows::11": {
        name: "OS::Windows::11",
        description: "Windows 11",
      },
    },
    "detection.composition": {
      Risk: {
        name: "Risk",
        description: "Risk scoring strategy",
      },
    },
  };

  it("matches by exact key, name leaf, and case-insensitive alias", () => {
    expect(lookupVocabTerm(index, "surface", "OS::Windows::11")?.name).toBe(
      "OS::Windows::11",
    );
    expect(lookupVocabTerm(index, "surface", "windows")?.name).toBe("Windows");
    expect(
      lookupVocabTerm(index, "detection.composition", "Risk")?.description,
    ).toBe("Risk scoring strategy");
  });
});
