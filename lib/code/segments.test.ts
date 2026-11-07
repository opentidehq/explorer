import { describe, expect, it } from "vitest";
import { highlightQuery } from "@/lib/code/highlight";
import { buildLines, fromLocalTokens } from "@/lib/code/segments";
import type { Diagnostic } from "@/lib/lsp/protocol";

const finding = (
  line: number,
  from: number,
  to: number,
  severity: Diagnostic["severity"] = 1,
  endLine = line,
): Diagnostic => ({
  severity,
  message: "m",
  range: {
    start: { line, character: from },
    end: { line: endLine, character: to },
  },
});

const text = (lines: ReturnType<typeof buildLines>) =>
  lines.map((line) => line.segments.map((s) => s.text).join("")).join("\n");

describe("buildLines", () => {
  const source = "SecurityEvent | wher EventID == 4688\n| take 1";
  const tokens = [
    [
      { character: 0, length: 13, kind: "type" as const },
      { character: 14, length: 1, kind: "op" as const },
      { character: 21, length: 7, kind: "key" as const },
    ],
    [{ character: 2, length: 4, kind: "kw" as const }],
  ];

  it("keeps every character", () => {
    expect(text(buildLines(source, tokens, [finding(0, 16, 20)], true))).toBe(
      source,
    );
  });

  it("marks server tokens as hover targets and underlines findings", () => {
    const [first] = buildLines(source, tokens, [finding(0, 16, 20)], true);
    const event = first!.segments.find((s) => s.text === "SecurityEvent")!;
    expect(event).toMatchObject({ kind: "type", token: true, character: 0 });
    const typo = first!.segments.find((s) => s.text === "wher")!;
    expect(typo).toMatchObject({ severity: 1, token: false, character: 16 });
    expect(first!.severity).toBe(1);
  });

  it("cuts a token where a finding starts or ends, keeping the most severe", () => {
    const [first] = buildLines(
      source,
      tokens,
      [finding(0, 8, 20, 2), finding(0, 16, 18, 1)],
      true,
    );
    const pieces = first!.segments.map((s) => [s.text, s.severity ?? null]);
    expect(pieces).toContainEqual(["Security", null]);
    expect(pieces).toContainEqual(["Event", 2]);
    expect(pieces).toContainEqual(["wh", 1]);
    expect(pieces).toContainEqual(["er", 2]);
  });

  it("spreads a multi-line finding over each line it covers", () => {
    const lines = buildLines(source, tokens, [finding(0, 29, 3, 2, 1)], true);
    expect(lines[0]!.severity).toBe(2);
    expect(lines[1]!.severity).toBeUndefined();
    expect(lines[1]!.segments[0]).toMatchObject({ text: "| ", severity: 2 });
  });

  it("puts a finding with no width at its character", () => {
    const [first] = buildLines(source, tokens, [finding(0, 15, 15, 3)], true);
    expect(first!.points).toEqual([{ character: 15, severity: 3 }]);
    expect(first!.segments.some((s) => s.character === 15)).toBe(true);
  });

  it("colours from the regex highlighter without hover targets", () => {
    const lines = buildLines(
      source,
      fromLocalTokens(highlightQuery(source)),
      [],
      false,
    );
    expect(text(lines)).toBe(source);
    expect(lines.flatMap((l) => l.segments).some((s) => s.token)).toBe(false);
    expect(lines[1]!.segments.find((s) => s.text === "take")?.kind).toBe("kw");
  });
});
