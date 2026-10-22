import { describe, expect, it } from "vitest";
import {
  collectCorpusValues,
  slimVocabIndex,
  trimDescription,
} from "./slim-vocab.mjs";
import { normalizeRepoUrl } from "./corpus-fields.mjs";

const technique = {
  name: "Valid Accounts",
  description:
    "Adversaries may obtain and abuse credentials of existing accounts.(Citation: report) Compromised credentials may be used to bypass access controls.",
  stages: ["Initial Access", "Persistence"],
  stage: "Initial Access",
  link: "https://attack.mitre.org/techniques/T1078",
};

/** @param {number} count */
function actorTerms(count) {
  /** @type {Record<string, { name: string, description: string }>} */
  const bucket = {};
  for (let i = 0; i < count; i += 1) {
    const term = { name: `Group ${i}`, description: `Actor ${i}` };
    bucket[`Group ${i}`] = term;
    bucket[`att&ck::G${String(i).padStart(4, "0")}`] = term;
  }
  return bucket;
}

const index = {
  "att&ck": {
    "Valid Accounts": technique,
    T1078: technique,
    "Initial Access::T1078": technique,
    "Persistence::Valid Accounts": technique,
  },
  severity: {
    High: { name: "High", description: "High severity" },
    Low: { name: "Low" },
  },
  actors: actorTerms(150),
};

describe("trimDescription", () => {
  it("drops citations and keeps whole sentences under the limit", () => {
    expect(trimDescription(technique.description, 90)).toBe(
      "Adversaries may obtain and abuse credentials of existing accounts.",
    );
  });

  it("never cuts inside a markdown link", () => {
    const text = `${"x".repeat(40)} [APT-C-23](https://attack.mitre.org/groups/G1028) is a group`;
    const out = trimDescription(text, 70);
    expect(out).toBe(`${"x".repeat(40)}…`);
  });
});

describe("slimVocabIndex", () => {
  const values = collectCorpusValues([
    { threat: { actors: [{ name: "att&ck::G0007" }], severity: "High" } },
  ]);
  const slim = slimVocabIndex(index, values);

  it("stores each term once and points every key at it", () => {
    const attack = slim.vocabs["att&ck"];
    expect(attack?.terms).toHaveLength(1);
    expect(attack?.keys.T1078).toBe(0);
    expect(attack?.keys["Valid Accounts"]).toBe(0);
    // Tactic-qualified keys repeat what `stages` already says.
    expect(attack?.keys["Initial Access::T1078"]).toBeUndefined();
    expect(attack?.terms[0]?.stages).toEqual(["Initial Access", "Persistence"]);
    expect(attack?.terms[0]?.description).not.toContain("Citation");
  });

  it("keeps small vocabularies whole", () => {
    expect(slim.vocabs.severity?.terms.map((t) => t.name)).toEqual([
      "High",
      "Low",
    ]);
  });

  it("keeps only the large-catalogue terms the corpus references", () => {
    const actors = slim.vocabs.actors;
    expect(actors?.terms.map((t) => t.name)).toEqual(["Group 7"]);
    expect(actors?.keys["att&ck::G0007"]).toBe(0);
    expect(actors?.keys["Group 7"]).toBe(0);
  });
});

describe("normalizeRepoUrl", () => {
  it("normalises ssh and https remotes and strips credentials", () => {
    expect(normalizeRepoUrl("git@github.com:opentidehq/library.git")).toBe(
      "https://github.com/opentidehq/library",
    );
    expect(
      normalizeRepoUrl(
        "https://x-access-token:abc@github.com/opentidehq/library",
      ),
    ).toBe("https://github.com/opentidehq/library");
    expect(
      normalizeRepoUrl("https://ci:p@ss@gitlab.com/opentide/library.git/"),
    ).toBe("https://gitlab.com/opentide/library");
    expect(normalizeRepoUrl("/srv/library")).toBe("");
    expect(normalizeRepoUrl(undefined)).toBe("");
  });
});
