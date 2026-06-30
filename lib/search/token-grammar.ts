/**
 * Structured search grammar (tokenized filters):
 *
 *   query   := clause ( ( WS | AND | OR ) clause | WS bare_relation )*
 *   clause  := field ( ":" | "!=" ) value
 *   field   := identifier
 *   value   := quoted_string | unquoted_token
 *
 * Implicit AND between adjacent clauses (`type:rule platform:sentinel`).
 * Explicit AND/OR are equivalent clause separators for filter parsing.
 * Bare `neighbors` / `chain` set relation mode (legacy).
 */

import {
  SEARCH_FIELDS,
  valuesForField,
  type TokenVocabulary,
} from "@/lib/search/token-catalog";

export type TokenPhase =
  | "start"
  | "after_boolean"
  | "after_field"
  | "after_operator"
  | "after_value";

export type ClauseOperator = ":" | "!=";

export interface ParsedClause {
  field: string;
  operator: ClauseOperator;
  value: string;
  start: number;
  end: number;
}

export interface QueryParseState {
  tokenStart: number;
  tokenEnd: number;
  phase: TokenPhase;
  field: string | null;
  operator: ClauseOperator | null;
  partial: string;
  inQuotes: boolean;
  completedClauses: ParsedClause[];
}

export const SEARCH_OPERATORS = [
  { op: ":" as const, label: ":", description: "Equals (default)" },
  { op: "!=" as const, label: "!=", description: "Not equal" },
] as const;

export const BOOLEAN_OPERATORS = [
  {
    op: "AND" as const,
    label: "AND",
    description: "Add another filter (all must match)",
  },
  { op: "OR" as const, label: "OR", description: "Add alternative filter" },
] as const;

export const BARE_RELATION_TOKENS = [
  "neighbors",
  "neighbor",
  "chain",
  "detection-chain",
  "match-only",
  "matches",
  "match",
] as const;

const FIELD_KEYS = new Set(
  SEARCH_FIELDS.flatMap((f) => [f.key, ...(f.aliases ?? [])]),
);

const BOOLEAN_SET = new Set(["and", "or"]);

function isFieldName(text: string): boolean {
  return FIELD_KEYS.has(text.toLowerCase());
}

function isBooleanToken(text: string): boolean {
  return BOOLEAN_SET.has(text.toLowerCase());
}

function valueIsComplete(
  field: string,
  value: string,
  vocab?: TokenVocabulary,
): boolean {
  if (!value || !vocab) return false;
  const known = valuesForField(field, vocab);
  const lower = value.toLowerCase();
  return known.some(
    (v) => v.value.toLowerCase() === lower || v.label?.toLowerCase() === lower,
  );
}

/** Quote-aware token boundaries at cursor (space-delimited). */
export function tokenBoundsAt(
  input: string,
  cursor: number,
): { start: number; end: number } {
  let start = cursor;
  let end = cursor;
  let inQuotes = false;

  while (start > 0) {
    const ch = input[start - 1]!;
    if (ch === '"' && (start === 1 || input[start - 2] !== "\\")) {
      inQuotes = !inQuotes;
      start -= 1;
      continue;
    }
    if (!inQuotes && ch === " ") break;
    start -= 1;
  }

  inQuotes = false;
  while (end < input.length) {
    const ch = input[end]!;
    if (ch === '"' && (end === 0 || input[end - 1] !== "\\")) {
      inQuotes = !inQuotes;
      end += 1;
      continue;
    }
    if (!inQuotes && ch === " ") break;
    end += 1;
  }

  return { start, end };
}

function splitOperator(token: string): {
  field: string;
  operator: ClauseOperator;
  valuePart: string;
} | null {
  const ne = token.indexOf("!=");
  const colon = token.indexOf(":");

  if (ne >= 0 && (colon < 0 || ne < colon)) {
    return {
      field: token.slice(0, ne),
      operator: "!=",
      valuePart: token.slice(ne + 2),
    };
  }
  if (colon >= 0) {
    return {
      field: token.slice(0, colon),
      operator: ":",
      valuePart: token.slice(colon + 1),
    };
  }
  return null;
}

function unquoteValue(raw: string): { value: string; inQuotes: boolean } {
  if (raw.startsWith('"') && !raw.endsWith('"')) {
    return { value: raw.slice(1), inQuotes: true };
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return { value: raw.slice(1, -1), inQuotes: false };
  }
  return { value: raw, inQuotes: false };
}

type Segment =
  | { kind: "clause"; clause: ParsedClause }
  | { kind: "boolean"; op: "AND" | "OR"; start: number; end: number }
  | { kind: "bare"; text: string; start: number; end: number };

/** Lex completed space-delimited segments before `end` (exclusive). */
export function lexSegments(input: string, end = input.length): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < end) {
    while (i < end && input[i] === " ") i += 1;
    if (i >= end) break;

    const bounds = tokenBoundsAt(input, i + 1);
    const start = bounds.start;
    const tokEnd = Math.min(bounds.end, end);
    const token = input.slice(start, tokEnd);
    i = tokEnd;

    if (!token) continue;

    const upper = token.toUpperCase();
    if (isBooleanToken(token)) {
      segments.push({
        kind: "boolean",
        op: upper as "AND" | "OR",
        start,
        end: tokEnd,
      });
      continue;
    }

    const split = splitOperator(token);
    if (split && split.field) {
      const { value } = unquoteValue(split.valuePart);
      segments.push({
        kind: "clause",
        clause: {
          field: split.field.toLowerCase(),
          operator: split.operator,
          value,
          start,
          end: tokEnd,
        },
      });
      continue;
    }

    segments.push({ kind: "bare", text: token, start, end: tokEnd });
  }

  return segments;
}

function cursorAfterWhitespace(input: string, cursor: number): boolean {
  return cursor > 0 && input[cursor - 1] === " ";
}

/**
 * Determine autocomplete phase and partial text at `cursor`.
 * Phases: start → field → operator → value → boolean → field …
 */
export function getQueryParseState(
  input: string,
  cursor: number,
  vocab?: TokenVocabulary,
): QueryParseState {
  const completedClauses: ParsedClause[] = [];
  const before = input.slice(0, cursor);
  const segments = lexSegments(before, before.length);

  for (const seg of segments) {
    if (seg.kind === "clause") completedClauses.push(seg.clause);
  }

  const betweenTokens = cursorAfterWhitespace(input, cursor);
  const { start, end } = tokenBoundsAt(input, cursor);
  const token = input.slice(start, end);
  const emptyToken = start === end || token.length === 0;

  if (betweenTokens || (emptyToken && before.trimEnd().length > 0)) {
    const trimmed = before.trimEnd();
    const prevSegments = lexSegments(trimmed, trimmed.length);
    const last = prevSegments[prevSegments.length - 1];

    if (!last) {
      return {
        tokenStart: cursor,
        tokenEnd: cursor,
        phase: "start",
        field: null,
        operator: null,
        partial: "",
        inQuotes: false,
        completedClauses,
      };
    }

    if (last.kind === "boolean") {
      return {
        tokenStart: cursor,
        tokenEnd: cursor,
        phase: "after_boolean",
        field: null,
        operator: null,
        partial: "",
        inQuotes: false,
        completedClauses,
      };
    }

    if (last.kind === "clause") {
      return {
        tokenStart: cursor,
        tokenEnd: cursor,
        phase: "after_value",
        field: null,
        operator: null,
        partial: "",
        inQuotes: false,
        completedClauses,
      };
    }

    if (last.kind === "bare" && isFieldName(last.text)) {
      return {
        tokenStart: cursor,
        tokenEnd: cursor,
        phase: "after_field",
        field: last.text.toLowerCase(),
        operator: null,
        partial: "",
        inQuotes: false,
        completedClauses,
      };
    }

    if (last.kind === "bare") {
      return {
        tokenStart: cursor,
        tokenEnd: cursor,
        phase: "after_value",
        field: null,
        operator: null,
        partial: "",
        inQuotes: false,
        completedClauses,
      };
    }
  }

  if (!token) {
    return {
      tokenStart: start,
      tokenEnd: end,
      phase: segments.length === 0 ? "start" : "after_value",
      field: null,
      operator: null,
      partial: "",
      inQuotes: false,
      completedClauses,
    };
  }

  const split = splitOperator(token);
  if (split) {
    const { value, inQuotes } = unquoteValue(split.valuePart);
    const atTokenEnd = cursor === end;
    const valueComplete =
      atTokenEnd &&
      value.length > 0 &&
      !inQuotes &&
      valueIsComplete(split.field, value, vocab);
    return {
      tokenStart: start,
      tokenEnd: end,
      phase: valueComplete ? "after_value" : "after_operator",
      field: split.field.toLowerCase(),
      operator: split.operator,
      partial: value,
      inQuotes,
      completedClauses,
    };
  }

  if (isBooleanToken(token)) {
    return {
      tokenStart: start,
      tokenEnd: end,
      phase: "after_value",
      field: null,
      operator: null,
      partial: token,
      inQuotes: false,
      completedClauses,
    };
  }

  if (isFieldName(token) && cursor === end) {
    return {
      tokenStart: start,
      tokenEnd: end,
      phase: "after_field",
      field: token.toLowerCase(),
      operator: null,
      partial: token,
      inQuotes: false,
      completedClauses,
    };
  }

  const prevSeg = segments.length > 0 ? segments[segments.length - 1] : null;
  const phase: TokenPhase =
    prevSeg?.kind === "boolean" ? "after_boolean" : "start";

  return {
    tokenStart: start,
    tokenEnd: end,
    phase,
    field: null,
    operator: null,
    partial: token,
    inQuotes: false,
    completedClauses,
  };
}

/** @deprecated Use getQueryParseState — kept for tests migrating from old API. */
export function getTokenContext(
  input: string,
  cursor: number,
): {
  tokenStart: number;
  tokenEnd: number;
  field: string | null;
  partial: string;
  phase: "field" | "value";
} {
  const state = getQueryParseState(input, cursor);
  const legacyPhase =
    state.phase === "after_operator"
      ? "value"
      : state.phase === "after_field"
        ? "field"
        : state.phase === "start" ||
            state.phase === "after_boolean" ||
            state.phase === "after_value"
          ? "field"
          : "value";

  return {
    tokenStart: state.tokenStart,
    tokenEnd: state.tokenEnd,
    field: state.field,
    partial: state.partial,
    phase: legacyPhase,
  };
}
