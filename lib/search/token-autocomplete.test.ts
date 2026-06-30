import { describe, expect, it } from "vitest";
import { parseFilterTokens } from "@/lib/search/filters";
import {
  applySuggestion,
  getTokenSuggestions,
} from "@/lib/search/token-autocomplete";
import { buildTokenVocabulary } from "@/lib/search/token-catalog";
import { getQueryParseState, lexSegments } from "@/lib/search/token-grammar";
import type { ExplorerBundle } from "@/lib/opentide/types";

const miniBundle: ExplorerBundle = {
  version: "0.1.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  models: { threat: {}, objective: {}, signal: {}, rule: {} },
  flatIndex: {},
  chaining: {},
  signals: {},
  summaries: [
    {
      uuid: "a",
      type: "rule",
      name: "Test rule",
      schema: "rule::1.0",
      tlp: "CLEAR",
      status: "STAGING",
      techniques: ["T1059"],
      actors: [],
      relatedCount: 1,
      platforms: ["sentinel"],
    },
    {
      uuid: "b",
      type: "threat",
      name: "Test threat",
      schema: "threat::1.0",
      techniques: [],
      actors: ["APT29"],
      relatedCount: 0,
      platforms: [],
    },
  ],
};

const vocab = buildTokenVocabulary(miniBundle);

describe("getQueryParseState phases", () => {
  it("starts in field phase on empty input", () => {
    const state = getQueryParseState("", 0);
    expect(state.phase).toBe("start");
    expect(state.field).toBeNull();
  });

  it("detects after_field when a complete field name is typed", () => {
    const state = getQueryParseState("type", 4);
    expect(state.phase).toBe("after_field");
    expect(state.field).toBe("type");
  });

  it("detects after_operator inside field:value token", () => {
    const state = getQueryParseState("type:r", 6, vocab);
    expect(state.phase).toBe("after_operator");
    expect(state.field).toBe("type");
    expect(state.partial).toBe("r");
  });

  it("detects after_operator right after colon", () => {
    const state = getQueryParseState("type:", 5);
    expect(state.phase).toBe("after_operator");
    expect(state.partial).toBe("");
  });

  it("detects after_value at end of complete clause value", () => {
    const state = getQueryParseState("type:rule", 9, vocab);
    expect(state.phase).toBe("after_value");
  });

  it("detects after_boolean after AND with trailing space", () => {
    const state = getQueryParseState("type:rule AND ", 14);
    expect(state.phase).toBe("after_boolean");
  });

  it("detects after_field after selecting a field with trailing space", () => {
    const state = getQueryParseState("type ", 5);
    expect(state.phase).toBe("after_field");
    expect(state.field).toBe("type");
  });

  it("tracks quoted value partials", () => {
    const state = getQueryParseState('actor:"APT', 11);
    expect(state.phase).toBe("after_operator");
    expect(state.field).toBe("actor");
    expect(state.inQuotes).toBe(true);
    expect(state.partial).toBe("APT");
  });
});

describe("lexSegments", () => {
  it("parses clauses, booleans, and bare relation tokens", () => {
    const segments = lexSegments("type:threat AND platform:sentinel neighbors");
    expect(segments.map((s) => s.kind)).toEqual([
      "clause",
      "boolean",
      "clause",
      "bare",
    ]);
    expect(segments[0]).toMatchObject({
      kind: "clause",
      clause: { field: "type", value: "threat" },
    });
    expect(segments[2]).toMatchObject({
      kind: "clause",
      clause: { field: "platform", value: "sentinel" },
    });
  });
});

describe("getTokenSuggestions by phase", () => {
  it("suggests only fields at start", () => {
    const { context, suggestions } = getTokenSuggestions("", 0, vocab);
    expect(context.phase).toBe("start");
    expect(suggestions.every((s) => s.kind === "field")).toBe(true);
    expect(suggestions.some((s) => s.label === "type")).toBe(true);
  });

  it("suggests operators after a complete field name", () => {
    const { context, suggestions } = getTokenSuggestions("type", 4, vocab);
    expect(context.phase).toBe("after_field");
    expect(suggestions.every((s) => s.kind === "operator")).toBe(true);
    expect(suggestions.some((s) => s.label === ":")).toBe(true);
  });

  it("suggests values after field: prefix", () => {
    const { context, suggestions } = getTokenSuggestions("type:r", 6, vocab);
    expect(context.phase).toBe("after_operator");
    expect(suggestions.every((s) => s.kind === "value")).toBe(true);
    expect(suggestions.some((s) => s.label === "rule")).toBe(true);
  });

  it("suggests booleans and fields after a complete clause", () => {
    const { suggestions } = getTokenSuggestions("type:rule ", 10, vocab);
    const kinds = new Set(suggestions.map((s) => s.kind));
    expect(kinds.has("boolean")).toBe(true);
    expect(kinds.has("field")).toBe(true);
  });

  it("does not suggest values when expecting a field", () => {
    const { suggestions } = getTokenSuggestions("plat", 4, vocab);
    expect(suggestions.every((s) => s.kind === "field")).toBe(true);
  });
});

describe("applySuggestion", () => {
  it("inserts field then operator then value in sequence", () => {
    let input = "";
    let cursor = 0;

    const field = getTokenSuggestions(input, cursor, vocab).suggestions.find(
      (s) => s.label === "type",
    )!;
    ({ next: input, cursor } = applySuggestion(
      input,
      getQueryParseState(input, cursor, vocab),
      field,
    ));
    expect(input).toBe("type");

    const op = getTokenSuggestions(input, cursor, vocab).suggestions.find(
      (s) => s.label === ":",
    )!;
    ({ next: input, cursor } = applySuggestion(
      input,
      getQueryParseState(input, cursor, vocab),
      op,
    ));
    expect(input).toBe("type:");

    const value = getTokenSuggestions(input, cursor, vocab).suggestions.find(
      (s) => s.label === "rule",
    )!;
    ({ next: input, cursor } = applySuggestion(
      input,
      getQueryParseState(input, cursor, vocab),
      value,
    ));
    expect(input).toBe("type:rule ");
  });
});

describe("parseFilterTokens AND/OR", () => {
  it("parses explicit AND between clauses", () => {
    const filters = parseFilterTokens("type:threat AND platform:sentinel");
    expect(filters.types).toContain("threat");
    expect(filters.platforms).toContain("sentinel");
    expect(filters.query).toBe("");
  });

  it("parses OR-separated clauses into the same flat filters (simple mode)", () => {
    const filters = parseFilterTokens('actor:"APT29" OR technique:T1059');
    expect(filters.actors).toContain("APT29");
    expect(filters.techniques).toContain("T1059");
  });

  it("keeps legacy implicit AND and bare neighbors", () => {
    const filters = parseFilterTokens("type:rule platform:sentinel neighbors");
    expect(filters.types).toContain("rule");
    expect(filters.platforms).toContain("sentinel");
    expect(filters.relationMode).toBe("include-neighbors");
    expect(filters.query).toBe("");
  });
});
