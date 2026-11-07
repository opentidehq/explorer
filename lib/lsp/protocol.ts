/**
 * The slice of the Language Server Protocol the explorer speaks with the opentide language
 * server, and the pure helpers around it. Positions count UTF-16 code units, as the server
 * declares (`positionEncoding: "utf-16"`) and as JavaScript strings do.
 */
import type { TokenKind } from "@/lib/code/highlight";

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

/** LSP `DiagnosticSeverity`: 1 error, 2 warning, 3 information, 4 hint. */
export type Severity = 1 | 2 | 3 | 4;

export interface Diagnostic {
  range: Range;
  severity: Severity;
  message: string;
  code?: string;
  source?: string;
}

/** One semantic token, decoded from the relative LSP encoding. */
export interface SemanticToken {
  line: number;
  character: number;
  length: number;
  /** The legend's token type name (`keyword`, `property`, …). */
  type: string;
}

export const SEVERITY_NAMES: Record<Severity, string> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

/** A severity the server sent, or `error` for one it did not (LSP leaves it to the client). */
export function severityOf(value: unknown): Severity {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : 1;
}

/**
 * Decode `textDocument/semanticTokens/full` data: five integers per token, the line and
 * start relative to the previous token (LSP 3.17 §semanticTokens).
 */
export function decodeSemanticTokens(
  data: ArrayLike<number>,
  tokenTypes: readonly string[],
): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i]!;
    const deltaStart = data[i + 1]!;
    if (deltaLine) {
      line += deltaLine;
      character = deltaStart;
    } else {
      character += deltaStart;
    }
    tokens.push({
      line,
      character,
      length: data[i + 2]!,
      type: tokenTypes[data[i + 3]!] ?? "variable",
    });
  }
  return tokens;
}

/**
 * The code-panel colour of an LSP token type. The panels have a small palette (keys,
 * strings, numbers, keywords, functions, operators, comments); types are folded into it.
 */
export function tokenKind(type: string): TokenKind {
  switch (type) {
    case "property":
    case "parameter":
      return "key";
    case "string":
    case "regexp":
      return "str";
    case "number":
      return "num";
    case "keyword":
    case "modifier":
    case "enumMember":
      return "kw";
    case "function":
    case "method":
    case "macro":
    case "decorator":
      return "fn";
    case "type":
    case "class":
    case "namespace":
    case "struct":
    case "interface":
    case "enum":
    case "typeParameter":
    case "event":
      return "type";
    case "operator":
      return "op";
    case "comment":
      return "comment";
    default:
      return "plain";
  }
}

/** Whether `position` lies in `range` (end exclusive; an empty range holds its start). */
export function rangeContains(range: Range, position: Position): boolean {
  const { start, end } = range;
  const afterStart =
    position.line > start.line ||
    (position.line === start.line && position.character >= start.character);
  const beforeEnd =
    position.line < end.line ||
    (position.line === end.line &&
      (position.character < end.character ||
        (start.line === end.line && start.character === end.character)));
  return afterStart && beforeEnd;
}

/** Count diagnostics by severity name. */
export function countBySeverity(
  diagnostics: readonly Diagnostic[],
): Record<"error" | "warning" | "info" | "hint", number> {
  const counts = { error: 0, warning: 0, info: 0, hint: 0 };
  for (const d of diagnostics) {
    counts[SEVERITY_NAMES[d.severity] as keyof typeof counts] += 1;
  }
  return counts;
}

/** Diagnostics in reading order: by position, then most severe first. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]) {
  return diagnostics.toSorted(
    (a, b) =>
      a.range.start.line - b.range.start.line ||
      a.range.start.character - b.range.start.character ||
      a.severity - b.severity,
  );
}
