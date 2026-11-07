/**
 * An object as the language server reads it: its YAML (the text the File tab shows), a URI,
 * and where each query sits in that text.
 *
 * The server analyses the whole object as one Tide YAML document: its own fields, and every
 * query it embeds in the query's language and platform profile. Its tokens, diagnostics and
 * hovers come back in file coordinates. A query panel shows the query on its own, so each
 * query gets a `QueryRegion` that maps panel positions to file positions and back.
 */
import type { Diagnostic, Position, SemanticToken } from "@/lib/lsp/protocol";
import type {
  BundleObjectSummary,
  ObjectBody,
  ObjectType,
} from "@/lib/opentide/types";

/** The keys under `configurations.<platform>` that hold a query the server analyses. */
export const QUERY_KEYS = ["query", "search", "condition"] as const;

/**
 * A query's place in the object's YAML. Panel line `i` is file line `line + i`, and panel
 * character `c` on it is file character `c + columns[i]`.
 */
export interface QueryRegion {
  /** `configurations` platform key. */
  platform: string;
  /** The key holding the query (`query`, `search`, `condition`). */
  key: string;
  /** The query as the panel shows it: the scalar's value, without trailing line breaks. */
  text: string;
  line: number;
  columns: number[];
}

export interface ObjectDocument {
  uri: string;
  text: string;
  /** Mappable queries, keyed `platform` (the panel shows one query per platform). */
  queries: Map<string, QueryRegion>;
}

const FOLDERS: Record<ObjectType, string> = {
  threat: "threats",
  objective: "objectives",
  signal: "signals",
  rule: "rules",
};

/**
 * The document's URI: the object's corpus path when the bundle has it, so path checks
 * (`filename_slug`) speak about the real file, under a folder named `objects` so the server
 * reads it as a Tide object.
 */
export function objectUri(summary: BundleObjectSummary): string {
  const path =
    summary.path && /\.ya?ml$/i.test(summary.path)
      ? summary.path.replace(/^\/+/, "")
      : `objects/${FOLDERS[summary.type]}/${summary.uuid}.yaml`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `file:///corpus/${encoded.startsWith("objects/") ? "" : "objects/"}${encoded}`;
}

/** Offsets of each line start in `text`. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Map a string scalar of `text` to the panel: a plain scalar on one line, or a literal block
 * (`|`) whose every line is the value's line behind the block's indentation. Folded and
 * quoted scalars are not a line-for-line copy of the value: they get no region, and their
 * panel keeps the regex highlighter.
 */
export function scalarRegion(
  text: string,
  starts: number[],
  value: string,
  type: string | undefined,
  range: readonly [number, number, number],
): Omit<QueryRegion, "platform" | "key"> | null {
  const shown = value.replace(/\n+$/, "");
  if (!shown) return null;
  const [start, end] = range;
  if (type === "PLAIN") {
    if (shown.includes("\n") || text.slice(start, end) !== shown) return null;
    const line = lineOf(starts, start);
    return { text: shown, line, columns: [start - starts[line]!] };
  }
  if (type !== "BLOCK_LITERAL") return null;
  const header = lineOf(starts, start);
  const valueLines = shown.split("\n");
  const columns: number[] = [];
  let indent: number | null = null;
  for (let i = 0; i < valueLines.length; i++) {
    const line = header + 1 + i;
    if (line >= starts.length) return null;
    const lineEnd = (starts[line + 1] ?? text.length + 1) - 1;
    const source = text.slice(starts[line]!, lineEnd);
    const wanted = valueLines[i]!;
    if (!wanted) {
      if (source.trim()) return null;
      columns.push(indent ?? 0);
      continue;
    }
    const column = source.length - wanted.length;
    if (
      column < 0 ||
      !source.endsWith(wanted) ||
      source.slice(0, column).trim()
    )
      return null;
    if (indent === null) indent = column;
    columns.push(column);
  }
  return { text: shown, line: header + 1, columns };
}

/**
 * The object's YAML, the way the File tab prints it, and the regions of its queries.
 * `yaml` loads with the first object opened, as it did for the File tab alone.
 */
export async function buildObjectDocument(
  summary: BundleObjectSummary,
  body: ObjectBody,
): Promise<ObjectDocument> {
  const { stringify, parseDocument, isMap, isScalar } = await import("yaml");
  const text = stringify(body, { lineWidth: 0 });
  const queries = new Map<string, QueryRegion>();
  const configurations = body["configurations"];
  if (configurations && typeof configurations === "object") {
    const doc = parseDocument(text);
    const starts = lineStarts(text);
    const node = doc.get("configurations", true);
    if (isMap(node)) {
      for (const pair of node.items) {
        const platform = isScalar(pair.key) ? String(pair.key.value) : null;
        if (!platform || !isMap(pair.value)) continue;
        for (const key of QUERY_KEYS) {
          const scalar = pair.value.get(key, true);
          if (
            !isScalar(scalar) ||
            typeof scalar.value !== "string" ||
            !scalar.range
          ) {
            continue;
          }
          const region = scalarRegion(
            text,
            starts,
            scalar.value,
            scalar.type,
            scalar.range,
          );
          if (region && !queries.has(platform)) {
            queries.set(platform, { platform, key, ...region });
          }
        }
      }
    }
  }
  return { uri: objectUri(summary), text, queries };
}

/* Mapping ------------------------------------------------------------------------------ */

/** A panel position as a file position, or null outside the region. */
export function toFile(
  region: QueryRegion,
  position: Position,
): Position | null {
  const column = region.columns[position.line];
  if (column === undefined) return null;
  return {
    line: region.line + position.line,
    character: position.character + column,
  };
}

/** A file position as a panel position, or null outside the region. */
export function toPanel(
  region: QueryRegion,
  position: Position,
): Position | null {
  const line = position.line - region.line;
  const column = region.columns[line];
  if (column === undefined || position.character < column) return null;
  return { line, character: position.character - column };
}

/** The file's semantic tokens that fall in the region, in panel coordinates. */
export function regionTokens(
  region: QueryRegion,
  tokens: readonly SemanticToken[],
): SemanticToken[] {
  const out: SemanticToken[] = [];
  for (const token of tokens) {
    const at = toPanel(region, token);
    if (at) out.push({ ...token, ...at });
  }
  return out;
}

/** A file position clamped into the region, in panel coordinates. */
function clampToPanel(region: QueryRegion, position: Position): Position {
  const lines = region.text.split("\n");
  const line = position.line - region.line;
  if (line < 0) return { line: 0, character: 0 };
  if (line >= lines.length) {
    return { line: lines.length - 1, character: lines.at(-1)!.length };
  }
  const character = position.character - region.columns[line]!;
  return {
    line,
    character: Math.max(0, Math.min(character, lines[line]!.length)),
  };
}

/**
 * The diagnostics about the query, in panel coordinates: those that start on one of its
 * lines, clipped to it. One that starts on another field (a missing key reported on the
 * platform block) belongs to that field.
 */
export function regionDiagnostics(
  region: QueryRegion,
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const last = region.line + region.columns.length - 1;
  return diagnostics
    .filter(
      (d) => d.range.start.line >= region.line && d.range.start.line <= last,
    )
    .map((d) => ({
      ...d,
      range: {
        start: clampToPanel(region, d.range.start),
        end: clampToPanel(region, d.range.end),
      },
    }));
}
