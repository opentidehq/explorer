import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  hasClause,
  parseFilterTokens,
  toggleClause,
  withoutDeploy,
  withoutFreeText,
  withReach,
} from "@/lib/search/filters";

describe("parseFilterTokens", () => {
  it("reads technique aliases as techniques", () => {
    expect(parseFilterTokens("attack:t1059 att&ck:T1078").techniques).toEqual([
      "T1059",
      "T1078",
    ]);
  });

  it("keeps free text beside clauses", () => {
    const filters = parseFilterTokens("type:rule powershell encoded");
    expect(filters.types).toEqual(["rule"]);
    expect(filters.query).toBe("powershell encoded");
  });

  it("reads words like chain, neighbours and staging as text", () => {
    const filters = parseFilterTokens("supply chain staging match-only");
    expect(filters.query).toBe("supply chain staging match-only");
    expect(filters.relationMode).toBe("include-neighbors");
    expect(filters.stagingOnly).toBe(false);
  });

  it("reads reach and deployment from their clauses", () => {
    expect(parseFilterTokens("reach:chains x").relationMode).toBe(
      "include-chain",
    );
    expect(parseFilterTokens("relation:match-only").relationMode).toBe(
      "match-only",
    );
    expect(parseFilterTokens("mode:neighbours").relationMode).toBe(
      "include-neighbors",
    );
    const deploy = parseFilterTokens("deploy:staging x");
    expect(deploy.stagingOnly).toBe(true);
    expect(deploy.query).toBe("x");
  });

  it("excludes values with !=", () => {
    const filters = parseFilterTokens(
      'type!=rule technique!=t1059 actor!="APT 29" deploy!=staging x',
    );
    expect(filters.exclude.types).toEqual(["rule"]);
    expect(filters.exclude.techniques).toEqual(["T1059"]);
    expect(filters.exclude.actors).toEqual(["APT 29"]);
    expect(filters.exclude.deploy).toEqual(["staging"]);
    expect(filters.types).toEqual([]);
    expect(filters.query).toBe("x");
    expect(activeFilterCount(filters)).toBe(5);
  });

  it("leaves a negated reach in the text rather than ignore it", () => {
    expect(parseFilterTokens("reach!=chains").query).toBe("reach!=chains");
  });

  it("leaves a value that means nothing for its field in the text", () => {
    const filters = parseFilterTokens(
      "type:rules deploy:prod reach:far type!=x",
    );
    expect(filters.types).toEqual([]);
    expect(filters.exclude.types).toEqual([]);
    expect(filters.stagingOnly || filters.productionOnly).toBe(false);
    expect(filters.relationMode).toBe("include-neighbors");
    expect(filters.query).toBe("type:rules deploy:prod reach:far type!=x");
  });

  it("keeps every uuid clause", () => {
    expect(parseFilterTokens("uuid:a uuid:b").uuids).toEqual(["a", "b"]);
  });

  it("drops a field still waiting for its value", () => {
    expect(parseFilterTokens("type: x").query).toBe("x");
  });

  it("keeps quoted text, joiners and all, as one phrase", () => {
    const filters = parseFilterTokens('"command and control" type:rule');
    expect(filters.query).toBe('"command and control"');
    expect(filters.groups).toEqual([]);
  });

  it("has no groups without explicit AND/OR", () => {
    expect(parseFilterTokens("type:rule platform:sentinel x").groups).toEqual(
      [],
    );
  });

  it("groups at OR and splits a group at AND", () => {
    const filters = parseFilterTokens(
      "type:rule OR technique:T1556 AND actor:G0007 reach:chains",
    );
    expect(
      filters.groups.map((group) =>
        group.map((set) => [...set.types, ...set.techniques, ...set.actors]),
      ),
    ).toEqual([[["rule"]], [["T1556"], ["G0007"]]]);
    // Reach is a setting of the whole search, wherever it is written.
    expect(filters.relationMode).toBe("include-chain");
    // The flat fields hold every clause, for chips and counts.
    expect(filters.types).toEqual(["rule"]);
    expect(filters.techniques).toEqual(["T1556"]);
    expect(filters.actors).toEqual(["G0007"]);
  });

  it("leaves out an alternative with nothing in it", () => {
    for (const input of [
      "type:rule OR platform:",
      "type:rule OR reach:chains",
      "type:rule OR OR",
    ]) {
      const filters = parseFilterTokens(input);
      expect(filters.groups).toEqual([]);
      expect(filters.types).toEqual(["rule"]);
    }
  });

  it("joins only with capitals and skips a lowercase and/or", () => {
    const filters = parseFilterTokens("search or destroy and type:rule");
    expect(filters.groups).toEqual([]);
    expect(filters.query).toBe("search destroy");
    expect(filters.types).toEqual(["rule"]);
  });

  it("ignores joiners with nothing to join", () => {
    const filters = parseFilterTokens("AND type:rule OR");
    expect(filters.groups).toEqual([]);
    expect(filters.types).toEqual(["rule"]);
    expect(filters.query).toBe("");
  });

  it("reads a clause only as a whole token", () => {
    const filters = parseFilterTokens("subtype:rule type:rule");
    expect(filters.types).toEqual(["rule"]);
    expect(filters.query).toBe("subtype:rule");
  });
});

describe("withReach", () => {
  it("replaces the reach clause and keeps every word", () => {
    expect(withReach("indicator match", "include-chain")).toBe(
      "indicator match reach:chains",
    );
    expect(withReach("indicator match reach:chains", "match-only")).toBe(
      "indicator match reach:matches",
    );
    expect(withReach("x relation:chain", "include-neighbors")).toBe("x");
  });
});

describe("withoutDeploy", () => {
  it("removes the clause however it was written, and only the clause", () => {
    expect(withoutDeploy("deploy:staging x", "staging")).toBe("x");
    expect(withoutDeploy("status:staging x", "staging")).toBe("x");
    expect(withoutDeploy("staging x", "staging")).toBe("staging x");
  });
});

describe("toggleClause", () => {
  it("adds and removes a clause", () => {
    const added = toggleClause("powershell", "type", "rule");
    expect(added).toBe("powershell type:rule");
    expect(hasClause(added, "type", "rule")).toBe(true);
    expect(toggleClause(added, "type", "rule")).toBe("powershell");
  });

  it("matches quoted values and field aliases", () => {
    expect(toggleClause('actor:"APT 29" x', "actor", "APT 29")).toBe("x");
    expect(toggleClause("attack:T1059", "technique", "T1059")).toBe("");
    expect(toggleClause("", "actor", "APT 29")).toBe('actor:"APT 29"');
  });

  it("does not match a clause inside a longer value", () => {
    expect(hasClause("technique:T1059.001", "technique", "T1059")).toBe(false);
  });

  it("adds a clause to every OR alternative, and takes it out of each", () => {
    const added = toggleClause(
      "actor:apt29 OR platform:sentinel",
      "type",
      "rule",
    );
    expect(added).toBe("actor:apt29 type:rule OR platform:sentinel type:rule");
    expect(
      parseFilterTokens(added).groups.map((group) => group[0]?.types),
    ).toEqual([["rule"], ["rule"]]);
    expect(toggleClause(added, "type", "rule")).toBe(
      "actor:apt29 OR platform:sentinel",
    );
  });

  it("adds and removes an exclusion separately from an inclusion", () => {
    const excluded = toggleClause("x", "type", "rule", "!=");
    expect(excluded).toBe("x type!=rule");
    expect(hasClause(excluded, "type", "rule")).toBe(false);
    expect(hasClause(excluded, "type", "rule", "!=")).toBe(true);
    expect(toggleClause(excluded, "type", "rule", "!=")).toBe("x");
  });
});

describe("withoutFreeText", () => {
  it("drops the words and keeps the clauses", () => {
    expect(withoutFreeText("type:rule powershell encoded")).toBe("type:rule");
  });

  it("never edits a quoted value", () => {
    expect(withoutFreeText('platform:"a b c" b')).toBe('platform:"a b c"');
    expect(withoutFreeText('"a b" actor:"a b"')).toBe('actor:"a b"');
  });

  it("keeps the joiners between the clauses that remain", () => {
    expect(withoutFreeText("x AND type:rule OR y AND platform:s")).toBe(
      "type:rule OR platform:s",
    );
    expect(withoutFreeText("type:rule OR y")).toBe("type:rule");
    expect(withoutFreeText("type:rules x")).toBe("");
  });
});
