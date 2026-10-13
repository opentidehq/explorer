/**
 * Small tokenizers for the deep-tide code panels: YAML object files and detection queries
 * (KQL, SPL, ES|QL, Lucene, SQL-like). They colour what a reader scans for — keys, strings,
 * keywords, pipes, comments — in the site's code palette, and stay a few kilobytes instead of
 * a grammar engine. Unknown text passes through as plain ink, so nothing is ever dropped.
 */

export type TokenKind =
  | "plain"
  | "key"
  | "str"
  | "num"
  | "kw"
  | "fn"
  | "op"
  | "punct"
  | "comment";

export interface Token {
  text: string;
  kind: TokenKind;
}

export type HighlightLanguage = "yaml" | "query";

/* YAML ------------------------------------------------------------------------------- */

const YAML_KEY_RE =
  /^(\s*(?:-\s+)*)((?:"[^"]*"|'[^']*'|[^\s#:'"][^:#]*?)):(?=\s|$)(.*)$/;
const YAML_ITEM_RE = /^(\s*)(-)(\s+|$)(.*)$/;
const BLOCK_SCALAR_RE = /^[|>][+-]?\d*\s*(#.*)?$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** A scalar after `key:` or `- `: quoted, number, boolean, block indicator or plain text. */
function yamlValue(text: string): Token[] {
  if (!text) return [];
  const lead = text.match(/^\s*/)?.[0] ?? "";
  let rest = text.slice(lead.length);
  const out: Token[] = lead ? [{ text: lead, kind: "plain" }] : [];

  const quoted = rest.match(/^(["'])(?:\\.|(?!\1).)*\1/);
  if (quoted) {
    out.push({ text: quoted[0], kind: "str" });
    const tail = rest.slice(quoted[0].length);
    if (tail)
      out.push({ text: tail, kind: /^\s*#/.test(tail) ? "comment" : "plain" });
    return out;
  }

  // A trailing comment.
  let comment = "";
  const hash = rest.search(/\s#/);
  if (hash !== -1) {
    comment = rest.slice(hash);
    rest = rest.slice(0, hash);
  } else if (rest.startsWith("#")) {
    comment = rest;
    rest = "";
  }

  if (rest) {
    let kind: TokenKind = "plain";
    if (/^-?\d+(\.\d+)?$/.test(rest.trim())) kind = "num";
    else if (/^(true|false|null|~|yes|no)$/i.test(rest.trim())) kind = "kw";
    else if (BLOCK_SCALAR_RE.test(rest.trim())) kind = "punct";
    else if (/^[[{]/.test(rest.trim())) kind = "punct";
    out.push({ text: rest, kind });
  }
  if (comment) out.push({ text: comment, kind: "comment" });
  return out;
}

export function highlightYaml(source: string): Token[][] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const result: Token[][] = [];
  // Inside a `|` or `>` block: lines indented deeper than its key are text.
  let blockIndent: number | null = null;

  for (const line of lines) {
    if (blockIndent !== null) {
      if (!line.trim() || indentOf(line) > blockIndent) {
        result.push(line ? [{ text: line, kind: "plain" }] : []);
        continue;
      }
      blockIndent = null;
    }

    if (/^\s*#/.test(line)) {
      result.push([{ text: line, kind: "comment" }]);
      continue;
    }
    if (/^\s*---\s*$/.test(line)) {
      result.push([{ text: line, kind: "punct" }]);
      continue;
    }

    const pair = line.match(YAML_KEY_RE);
    if (pair) {
      const [, lead = "", key = "", value = ""] = pair;
      const tokens: Token[] = [];
      const dash = lead.match(/^(\s*)(-\s+)(.*)$/);
      if (dash) {
        if (dash[1]) tokens.push({ text: dash[1], kind: "plain" });
        tokens.push({ text: dash[2]!, kind: "punct" });
        if (dash[3]) tokens.push({ text: dash[3], kind: "plain" });
      } else if (lead) {
        tokens.push({ text: lead, kind: "plain" });
      }
      tokens.push({ text: key, kind: "key" });
      tokens.push({ text: ":", kind: "punct" });
      tokens.push(...yamlValue(value));
      if (BLOCK_SCALAR_RE.test(value.trim())) blockIndent = indentOf(line);
      result.push(tokens);
      continue;
    }

    const item = line.match(YAML_ITEM_RE);
    if (item) {
      const [, lead = "", dash = "", gap = "", value = ""] = item;
      const tokens: Token[] = [];
      if (lead) tokens.push({ text: lead, kind: "plain" });
      tokens.push({ text: dash, kind: "punct" });
      if (gap) tokens.push({ text: gap, kind: "plain" });
      tokens.push(...yamlValue(value));
      if (BLOCK_SCALAR_RE.test(value.trim())) blockIndent = indentOf(line);
      result.push(tokens);
      continue;
    }

    result.push(line ? [{ text: line, kind: "plain" }] : []);
  }

  return result;
}

/* Queries ---------------------------------------------------------------------------- */

const QUERY_KEYWORDS = new Set(
  [
    // KQL
    "let",
    "where",
    "project",
    "project-away",
    "project-rename",
    "extend",
    "summarize",
    "by",
    "join",
    "kind",
    "on",
    "union",
    "take",
    "top",
    "limit",
    "sort",
    "order",
    "asc",
    "desc",
    "distinct",
    "count",
    "render",
    "mv-expand",
    "parse",
    "evaluate",
    "invoke",
    "materialize",
    "has",
    "has_any",
    "has_all",
    "!has",
    "contains",
    "!contains",
    "startswith",
    "endswith",
    "matches",
    "regex",
    "in",
    "!in",
    "in~",
    "between",
    "and",
    "or",
    "not",
    "inner",
    "leftouter",
    "rightouter",
    "fullouter",
    "leftanti",
    "leftsemi",
    "as",
    "with",
    "datatable",
    "range",
    "print",
    "case",
    "iff",
    "true",
    "false",
    "null",
    // SPL
    "search",
    "stats",
    "eval",
    "table",
    "fields",
    "rename",
    "dedup",
    "rex",
    "lookup",
    "inputlookup",
    "outputlookup",
    "tstats",
    "from",
    "datamodel",
    "bin",
    "bucket",
    "timechart",
    "chart",
    "head",
    "tail",
    "transaction",
    "append",
    "appendpipe",
    "fillnull",
    "makemv",
    "mvexpand",
    "spath",
    "streamstats",
    "eventstats",
    "index",
    "sourcetype",
    "source",
    "earliest",
    "latest",
    "NOT",
    "AND",
    "OR",
    "TERM",
    "IN",
    // SQL / ES|QL / Lucene
    "select",
    "keep",
    "drop",
    "row",
    "metadata",
    "group",
    "having",
    "like",
    "rlike",
    "is",
    "exists",
    "sequence",
    "any",
    "until",
    "maxspan",
  ].map((word) => word.toLowerCase()),
);

/** Ordered: the first pattern that matches at the cursor wins. */
const QUERY_PATTERNS: Array<[RegExp, TokenKind | "word"]> = [
  [/^\/\/.*/, "comment"],
  [/^```[\s\S]*?```/, "comment"],
  [/^--.*/, "comment"],
  [/^@?"(?:[^"\\]|\\.)*"?/, "str"],
  [/^'(?:[^'\\]|\\.)*'?/, "str"],
  [/^`[^`]*`?/, "fn"],
  [/^\d+(\.\d+)?(ms|s|m|h|d)?\b/, "num"],
  [/^(==|!=|=~|!~|>=|<=|=>|\|\||&&)/, "op"],
  [/^\|/, "op"],
  [/^[=<>+\-*/%!]/, "op"],
  [/^[()[\]{},;.]/, "punct"],
  [/^[A-Za-z_$][\w$.\-!~]*/, "word"],
  [/^\s+/, "plain"],
];

function classifyWord(word: string, rest: string): TokenKind {
  if (/^\s*\(/.test(rest)) return "fn";
  // SPL / Lucene `field=value` and `field:value`.
  if (/^\s*[=:](?![=~])/.test(rest)) return "key";
  if (QUERY_KEYWORDS.has(word.toLowerCase())) return "kw";
  return "plain";
}

function tokenizeQueryLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    let matched = false;
    for (const [pattern, kind] of QUERY_PATTERNS) {
      const m = rest.match(pattern);
      if (!m || !m[0]) continue;
      const text = m[0];
      const tokenKind =
        kind === "word" ? classifyWord(text, rest.slice(text.length)) : kind;
      const last = tokens[tokens.length - 1];
      if (last && last.kind === tokenKind && tokenKind === "plain") {
        last.text += text;
      } else {
        tokens.push({ text, kind: tokenKind });
      }
      i += text.length;
      matched = true;
      break;
    }
    if (!matched) {
      const last = tokens[tokens.length - 1];
      if (last && last.kind === "plain") last.text += line[i];
      else tokens.push({ text: line[i]!, kind: "plain" });
      i += 1;
    }
  }
  return tokens;
}

export function highlightQuery(source: string): Token[][] {
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line ? tokenizeQueryLine(line) : []));
}

export function highlight(
  source: string,
  language: HighlightLanguage,
): Token[][] {
  return language === "yaml" ? highlightYaml(source) : highlightQuery(source);
}
