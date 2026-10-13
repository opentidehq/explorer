import { describe, expect, it } from "vitest";
import {
  highlightQuery,
  highlightYaml,
  type Token,
} from "@/lib/code/highlight";

const text = (lines: Token[][]) =>
  lines.map((line) => line.map((t) => t.text).join("")).join("\n");

const kinds = (line: Token[] | undefined, kind: Token["kind"]) =>
  (line ?? []).filter((t) => t.kind === kind).map((t) => t.text.trim());

describe("highlightYaml", () => {
  const source = [
    "name: AAA bypass",
    "metadata:",
    "  uuid: 53389577-fd8d-4ce6-9852-8365ed947c17",
    "  version: 1",
    "threat:",
    "  att&ck:",
    "    - T1562.001",
    "  description: |-",
    "    LINE VIPER: implements a bypass",
    "    - not a list item",
    '  severity: "Substantial incident" # scored',
    "  chaining:",
    "    - relation: support::enabled",
  ].join("\n");
  const lines = highlightYaml(source);

  it("keeps every character", () => {
    expect(text(lines)).toBe(source);
  });

  it("marks keys, numbers, strings and comments", () => {
    expect(kinds(lines[0], "key")).toEqual(["name"]);
    expect(kinds(lines[3], "num")).toEqual(["1"]);
    expect(kinds(lines[5], "key")).toEqual(["att&ck"]);
    expect(kinds(lines[10], "str")).toEqual(['"Substantial incident"']);
    expect(kinds(lines[10], "comment")).toEqual(["# scored"]);
  });

  it("treats block scalar bodies as text, not keys or items", () => {
    expect(kinds(lines[7], "punct")).toContain("|-");
    expect(kinds(lines[8], "key")).toEqual([]);
    expect(kinds(lines[9], "punct")).toEqual([]);
    expect(kinds(lines[12], "key")).toEqual(["relation"]);
  });
});

describe("highlightQuery", () => {
  it("colours KQL pipes, keywords, functions and strings", () => {
    const [line] = highlightQuery(
      "SecurityEvent | where EventID == 4688 and isnotempty(CommandLine) // hit",
    );
    expect(kinds(line, "op")).toEqual(["|", "=="]);
    expect(kinds(line, "kw")).toEqual(["where", "and"]);
    expect(kinds(line, "fn")).toEqual(["isnotempty"]);
    expect(kinds(line, "num")).toEqual(["4688"]);
    expect(kinds(line, "comment")).toEqual(["// hit"]);
  });

  it("reads SPL field=value pairs and macros", () => {
    const [line] = highlightQuery(
      '`win_logs` EventID=4688 NOT TERM(-enc) | rex field=CommandLine "(?i)x"',
    );
    expect(kinds(line, "fn")).toEqual(["`win_logs`", "TERM"]);
    expect(kinds(line, "key")).toEqual(["EventID", "field"]);
    expect(kinds(line, "kw")).toEqual(["NOT", "rex"]);
    expect(kinds(line, "str")).toEqual(['"(?i)x"']);
  });

  it("keeps every character, including unterminated strings", () => {
    const source = 'x | where a == "open\nnext line';
    expect(text(highlightQuery(source))).toBe(source);
  });
});
