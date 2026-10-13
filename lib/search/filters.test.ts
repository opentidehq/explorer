import { describe, expect, it } from "vitest";
import {
  hasClause,
  parseFilterTokens,
  toggleClause,
  withoutFreeText,
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
});

describe("withoutFreeText", () => {
  it("drops the words and keeps the clauses", () => {
    const query = "type:rule powershell encoded";
    expect(withoutFreeText(query, parseFilterTokens(query))).toBe("type:rule");
  });
});
