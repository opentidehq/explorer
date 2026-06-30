import { describe, expect, it } from "vitest";
import { formatFilterTokens, parseFilterTokens } from "@/lib/search/filters";
import { getTokenSuggestions } from "@/lib/search/token-autocomplete";
import {
  buildTokenVocabulary,
  matchFields,
  valuesForField,
} from "@/lib/search/token-catalog";
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

describe("token-catalog", () => {
  it("exposes schema-aware filter fields", () => {
    const fields = matchFields("");
    expect(fields.map((f) => f.key)).toContain("schema");
    expect(fields.map((f) => f.key)).toContain("technique");
  });

  it("builds vocabulary from corpus summaries", () => {
    const vocab = buildTokenVocabulary(miniBundle);
    expect(vocab.platforms).toContain("sentinel");
    expect(vocab.techniques).toContain("T1059");
    expect(vocab.actors).toContain("APT29");
    expect(vocab.schemas).toContain("rule::1.0");
    expect(vocab.valueHints).toEqual({});
  });

  it("returns platform values for platform field", () => {
    const vocab = buildTokenVocabulary(miniBundle);
    const values = valuesForField("platform", vocab);
    expect(values.some((v) => v.value === "sentinel")).toBe(true);
  });
});

describe("token-autocomplete", () => {
  const vocab = buildTokenVocabulary(miniBundle);

  it("suggests type field when typing type prefix", () => {
    const { suggestions } = getTokenSuggestions("ty", 2, vocab);
    expect(suggestions.some((s) => s.label === "type")).toBe(true);
  });

  it("suggests operators when a field name is complete", () => {
    const { suggestions } = getTokenSuggestions("type", 4, vocab);
    expect(suggestions.some((s) => s.label === ":")).toBe(true);
  });

  it("suggests object types after type:", () => {
    const { suggestions } = getTokenSuggestions("type:r", 6, vocab);
    expect(suggestions.some((s) => s.label === "rule")).toBe(true);
  });
});

describe("parseFilterTokens schema/tlp", () => {
  it("parses schema and tlp tokens", () => {
    const filters = parseFilterTokens(
      "schema:rule::1.0 tlp:CLEAR platform:sentinel",
    );
    expect(filters.schemas).toContain("rule::1.0");
    expect(filters.tlps).toContain("CLEAR");
    expect(filters.platforms).toContain("sentinel");
  });

  it("ignores incomplete field tokens in query", () => {
    const filters = parseFilterTokens("type:");
    expect(filters.query).toBe("");
    expect(filters.types).toEqual([]);
  });
});

describe("formatFilterTokens", () => {
  it("round-trips structured filters for command palette sync", () => {
    const input = "type:rule uuid:abc-123 neighbors staging";
    const filters = parseFilterTokens(input);
    const serialized = formatFilterTokens(filters);
    expect(parseFilterTokens(serialized)).toEqual(filters);
  });
});
