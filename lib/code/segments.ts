/**
 * The lines of a code panel as runs of text, each with one colour and at most one finding:
 * the cut of the line at every token and diagnostic boundary. Tokens come from the language
 * server's semantic tokens or, before it answers, from the regex highlighter.
 */
import type { Token, TokenKind } from "@/lib/code/highlight";
import type { Diagnostic, Severity } from "@/lib/lsp/protocol";

export interface LineToken {
  character: number;
  length: number;
  kind: TokenKind;
}

export interface Segment {
  text: string;
  kind: TokenKind;
  /** First character of the run on its line. */
  character: number;
  /** Most severe finding under the run. */
  severity?: Severity;
  /** Whether the run is a token the server knows (a hover target). */
  token: boolean;
}

export interface PanelLine {
  segments: Segment[];
  /** Most severe finding that starts on the line. */
  severity?: Severity;
  /** A finding with no width on this line, at this character. */
  points: Array<{ character: number; severity: Severity }>;
}

/** The regex highlighter's tokens as positioned tokens. */
export function fromLocalTokens(lines: Token[][]): LineToken[][] {
  return lines.map((tokens) => {
    const out: LineToken[] = [];
    let character = 0;
    for (const token of tokens) {
      if (token.kind !== "plain") {
        out.push({ character, length: token.text.length, kind: token.kind });
      }
      character += token.text.length;
    }
    return out;
  });
}

function moreSevere(a: Severity | undefined, b: Severity): Severity {
  return a === undefined || b < a ? b : a;
}

/**
 * Cut each line of `source` at token and diagnostic boundaries.
 * @param tokens per line, in any order; overlapping tokens keep the first.
 * @param serverTokens whether `tokens` came from the server (runs become hover targets).
 */
export function buildLines(
  source: string,
  tokens: LineToken[][],
  diagnostics: readonly Diagnostic[],
  serverTokens: boolean,
): PanelLine[] {
  const texts = source.split("\n");
  return texts.map((text, line) => {
    // Finding spans on this line, as [from, to).
    const spans: Array<{ from: number; to: number; severity: Severity }> = [];
    const points: PanelLine["points"] = [];
    let lineSeverity: Severity | undefined;
    for (const d of diagnostics) {
      const { start, end } = d.range;
      if (line < start.line || line > end.line) continue;
      if (line === start.line)
        lineSeverity = moreSevere(lineSeverity, d.severity);
      const from =
        line === start.line ? Math.min(start.character, text.length) : 0;
      const to =
        line === end.line ? Math.min(end.character, text.length) : text.length;
      if (to > from) spans.push({ from, to, severity: d.severity });
      else if (line === start.line) {
        points.push({ character: from, severity: d.severity });
      }
    }

    const lineTokens = (tokens[line] ?? [])
      .filter((t) => t.length > 0 && t.character < text.length)
      .toSorted((a, b) => a.character - b.character);
    const cuts = new Set<number>([0, text.length]);
    let covered = 0;
    const kept: LineToken[] = [];
    for (const token of lineTokens) {
      if (token.character < covered) continue;
      const end = Math.min(token.character + token.length, text.length);
      kept.push({ ...token, length: end - token.character });
      cuts.add(token.character);
      cuts.add(end);
      covered = end;
    }
    for (const span of spans) {
      cuts.add(span.from);
      cuts.add(span.to);
    }
    for (const point of points) cuts.add(point.character);
    const sorted = [...cuts].toSorted((a, b) => a - b);

    const segments: Segment[] = [];
    let t = 0;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const from = sorted[i]!;
      const to = sorted[i + 1]!;
      if (to <= from) continue;
      while (t < kept.length && kept[t]!.character + kept[t]!.length <= from)
        t++;
      const token =
        t < kept.length && kept[t]!.character <= from ? kept[t] : undefined;
      let severity: Severity | undefined;
      for (const span of spans) {
        if (span.from <= from && span.to >= to) {
          severity = moreSevere(severity, span.severity);
        }
      }
      const kind = token?.kind ?? "plain";
      const isToken = serverTokens && token !== undefined;
      const last = segments.at(-1);
      // Merge plain runs with nothing on them, so a line stays a few nodes.
      if (
        last &&
        !isToken &&
        !last.token &&
        last.kind === kind &&
        last.severity === severity &&
        kind === "plain" &&
        !points.some((point) => point.character === from)
      ) {
        last.text += text.slice(from, to);
        continue;
      }
      segments.push({
        text: text.slice(from, to),
        kind,
        character: from,
        severity,
        token: isToken,
      });
    }
    return { segments, severity: lineSeverity, points };
  });
}
