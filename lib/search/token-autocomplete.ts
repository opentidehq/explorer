import {
  matchFields,
  valuesForField,
  type TokenVocabulary,
} from "@/lib/search/token-catalog";
import { supportsNegation } from "@/lib/search/filters";
import {
  BOOLEAN_OPERATORS,
  SEARCH_OPERATORS,
  getQueryParseState,
  type QueryParseState,
} from "@/lib/search/token-grammar";

export type SuggestionKind = "field" | "operator" | "value" | "boolean";

export interface TokenSuggestion {
  kind: SuggestionKind;
  label: string;
  insert: string;
  description?: string;
  score: number;
}

export type TokenContext = QueryParseState;

function scoreMatch(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (lower === q) return 100;
  if (lower.startsWith(q)) return 80;
  if (lower.includes(q)) return 40;
  return 0;
}

function fieldSuggestions(partial: string): TokenSuggestion[] {
  const fields = matchFields(partial);
  const suggestions: TokenSuggestion[] = [];

  for (const field of fields) {
    const score = scoreMatch(field.key, partial);
    if (score === 0 && partial) continue;
    suggestions.push({
      kind: "field",
      label: field.key,
      insert: field.key,
      description: field.description,
      score: score + 10,
    });
  }

  return suggestions.toSorted((a, b) => b.score - a.score);
}

function operatorSuggestions(
  partial: string,
  field: string | null,
): TokenSuggestion[] {
  const suggestions: TokenSuggestion[] = [];
  for (const { op, label, description } of SEARCH_OPERATORS) {
    if (op === "!=" && !(field && supportsNegation(field))) continue;
    const score = scoreMatch(label, partial);
    if (score === 0 && partial) continue;
    suggestions.push({
      kind: "operator",
      label,
      insert: op,
      description,
      score: op === ":" ? score + 20 : score,
    });
  }
  return suggestions.toSorted((a, b) => b.score - a.score);
}

function booleanSuggestions(partial: string): TokenSuggestion[] {
  const suggestions: TokenSuggestion[] = [];
  for (const { op, label, description } of BOOLEAN_OPERATORS) {
    const score = scoreMatch(label, partial);
    if (score === 0 && partial) continue;
    suggestions.push({
      kind: "boolean",
      label,
      insert: op,
      description,
      score,
    });
  }
  return suggestions.toSorted((a, b) => b.score - a.score);
}

function valueSuggestions(
  field: string,
  partial: string,
  vocab: TokenVocabulary,
): TokenSuggestion[] {
  const values = valuesForField(field, vocab);
  const suggestions: TokenSuggestion[] = [];

  for (const { value, label, description } of values) {
    const display = label ?? value;
    const score = scoreMatch(display, partial) || scoreMatch(value, partial);
    if (score === 0 && partial) continue;
    const needsQuotes = /\s/.test(value);
    const insert = needsQuotes ? `"${value}"` : value;
    suggestions.push({
      kind: "value",
      label: display,
      insert,
      description,
      score,
    });
  }

  return suggestions.toSorted((a, b) => b.score - a.score);
}

function suggestionsForPhase(
  state: QueryParseState,
  vocab: TokenVocabulary,
): TokenSuggestion[] {
  const { phase, field, partial } = state;

  switch (phase) {
    case "start":
    case "after_boolean":
      return fieldSuggestions(partial);

    case "after_field":
      return operatorSuggestions("", field);

    case "after_operator":
      return field
        ? valueSuggestions(field, partial, vocab)
        : fieldSuggestions(partial);

    case "after_value": {
      const boolean = booleanSuggestions(partial);
      if (partial && boolean.length === 0) {
        return [...boolean, ...fieldSuggestions(partial)];
      }
      if (partial && boolean.some((b) => b.score >= 40)) {
        return boolean;
      }
      const fields = fieldSuggestions(partial);
      if (!partial) {
        return [
          ...boolean.map((b) => ({ ...b, score: b.score + 50 })),
          ...fields,
        ].toSorted((a, b) => b.score - a.score);
      }
      return [...boolean, ...fields].toSorted((a, b) => b.score - a.score);
    }

    default:
      return fieldSuggestions(partial);
  }
}

export function getTokenSuggestions(
  input: string,
  cursor: number,
  vocab: TokenVocabulary,
  limit = 12,
): { context: TokenContext; suggestions: TokenSuggestion[] } {
  const context = getQueryParseState(input, cursor, vocab);
  const raw = suggestionsForPhase(context, vocab);
  const suggestions = raw.slice(0, limit);
  return { context, suggestions };
}

export function applySuggestion(
  input: string,
  context: TokenContext,
  suggestion: TokenSuggestion,
): { next: string; cursor: number } {
  const before = input.slice(0, context.tokenStart);
  const after = input.slice(context.tokenEnd);

  let insert = suggestion.insert;

  switch (suggestion.kind) {
    case "field":
      // Selecting a field from start/boolean positions — leave cursor ready for operator.
      if (context.phase === "start" || context.phase === "after_boolean") {
        insert = suggestion.insert;
      }
      break;
    case "operator":
      insert = `${context.field ?? ""}${suggestion.insert}`;
      break;
    case "value":
      if (context.field && context.operator) {
        insert = `${context.field}${context.operator}${suggestion.insert}`;
      }
      break;
    case "boolean":
      insert = suggestion.insert;
      break;
  }

  const needsSpaceBefore =
    before.length > 0 &&
    !before.endsWith(" ") &&
    (suggestion.kind === "boolean" ||
      (suggestion.kind === "field" &&
        (context.phase === "after_value" ||
          context.phase === "after_boolean")) ||
      (suggestion.kind === "value" && !context.field));
  const needsSpaceAfter =
    suggestion.kind === "boolean" ||
    (suggestion.kind === "value" && context.field);

  const gapBefore = needsSpaceBefore ? " " : "";
  const gapAfter = needsSpaceAfter ? " " : "";

  const next = `${before}${gapBefore}${insert}${gapAfter}${after}`;
  const cursorPos = (before + gapBefore + insert + gapAfter).length;

  return { next, cursor: cursorPos };
}
