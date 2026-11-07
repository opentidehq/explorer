import { describe, expect, it } from "vitest";
import {
  countBySeverity,
  decodeSemanticTokens,
  rangeContains,
  severityOf,
  sortDiagnostics,
  tokenKind,
  type Diagnostic,
} from "@/lib/lsp/protocol";

describe("decodeSemanticTokens", () => {
  it("decodes relative lines and starts", () => {
    const legend = ["keyword", "property", "operator"];
    expect(
      decodeSemanticTokens(
        [0, 2, 5, 0, 0, 0, 6, 3, 2, 0, 2, 4, 1, 1, 0],
        legend,
      ),
    ).toEqual([
      { line: 0, character: 2, length: 5, type: "keyword" },
      { line: 0, character: 8, length: 3, type: "operator" },
      { line: 2, character: 4, length: 1, type: "property" },
    ]);
  });

  it("names a type missing from the legend a variable", () => {
    expect(decodeSemanticTokens([0, 0, 1, 9, 0], [])[0]!.type).toBe("variable");
  });
});

describe("tokenKind", () => {
  it("folds LSP types into the panel palette", () => {
    expect(tokenKind("property")).toBe("key");
    expect(tokenKind("keyword")).toBe("kw");
    expect(tokenKind("function")).toBe("fn");
    expect(tokenKind("type")).toBe("type");
    expect(tokenKind("string")).toBe("str");
    expect(tokenKind("variable")).toBe("plain");
  });
});

describe("diagnostic helpers", () => {
  const at = (line: number, character: number, severity = 1): Diagnostic => ({
    severity: severityOf(severity),
    message: "",
    range: {
      start: { line, character },
      end: { line, character: character + 2 },
    },
  });

  it("contains positions end-exclusively, and an empty range its start", () => {
    const range = at(1, 4).range;
    expect(rangeContains(range, { line: 1, character: 4 })).toBe(true);
    expect(rangeContains(range, { line: 1, character: 6 })).toBe(false);
    const empty = { start: range.start, end: range.start };
    expect(rangeContains(empty, { line: 1, character: 4 })).toBe(true);
  });

  it("counts and sorts", () => {
    const list = [at(3, 0, 2), at(1, 5, 1), at(1, 5, 3), at(0, 0, 9)];
    expect(countBySeverity(list)).toEqual({
      error: 2,
      warning: 1,
      info: 1,
      hint: 0,
    });
    expect(
      sortDiagnostics(list).map((d) => [d.range.start.line, d.severity]),
    ).toEqual([
      [0, 1],
      [1, 1],
      [1, 3],
      [3, 2],
    ]);
  });
});
