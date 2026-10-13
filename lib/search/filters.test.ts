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
    const query = "type:rule powershell encoded";
    expect(withoutFreeText(query, parseFilterTokens(query))).toBe("type:rule");
  });
});
