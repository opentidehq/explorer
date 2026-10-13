import type { ObjectType } from "@/lib/opentide/types";

export type RelationMode = "match-only" | "include-neighbors" | "include-chain";

export type ClauseOperator = ":" | "!=";

export type DeployTarget = "staging" | "production";

/** What `field!=value` clauses leave out: an object with any of these values is dropped. */
export interface ExcludedValues {
  types: ObjectType[];
  platforms: string[];
  statuses: string[];
  techniques: string[];
  actors: string[];
  schemas: string[];
  tlps: string[];
  uuids: string[];
  deploy: DeployTarget[];
}

export interface CatalogFilters {
  query: string;
  types: ObjectType[];
  platforms: string[];
  statuses: string[];
  techniques: string[];
  actors: string[];
  schemas: string[];
  tlps: string[];
  uuid: string;
  relationMode: RelationMode;
  stagingOnly: boolean;
  productionOnly: boolean;
  exclude: ExcludedValues;
}

function emptyExclusions(): ExcludedValues {
  return {
    types: [],
    platforms: [],
    statuses: [],
    techniques: [],
    actors: [],
    schemas: [],
    tlps: [],
    uuids: [],
    deploy: [],
  };
}

export const DEFAULT_FILTERS: CatalogFilters = {
  query: "",
  types: [],
  platforms: [],
  statuses: [],
  techniques: [],
  actors: [],
  schemas: [],
  tlps: [],
  uuid: "",
  relationMode: "include-neighbors",
  stagingOnly: false,
  productionOnly: false,
  exclude: emptyExclusions(),
};

const OBJECT_TYPES = new Set<ObjectType>([
  "threat",
  "objective",
  "signal",
  "rule",
]);

/** `reach:` values, with the spellings earlier versions and the docs used. */
const REACH_ALIASES: Record<string, RelationMode> = {
  matches: "match-only",
  match: "match-only",
  "match-only": "match-only",
  neighbours: "include-neighbors",
  neighbour: "include-neighbors",
  neighbors: "include-neighbors",
  neighbor: "include-neighbors",
  chains: "include-chain",
  chain: "include-chain",
  "detection-chain": "include-chain",
};

/** How each reach is written in a search. */
export const REACH_VALUE: Record<RelationMode, string> = {
  "match-only": "matches",
  "include-neighbors": "neighbours",
  "include-chain": "chains",
};

function parseReach(raw: string): RelationMode | undefined {
  return REACH_ALIASES[raw.toLowerCase().replace(/_/g, "-")];
}

/** Field names that may appear before `:` or `!=`, aliases included. */
const FIELD_ALIASES: Record<string, string[]> = {
  technique: ["technique", "attack", "att&ck"],
  reach: ["reach", "relation", "mode"],
};

const FILTER_FIELD_KEYS = [
  "type",
  "platform",
  "status",
  ...FIELD_ALIASES.technique!,
  "actor",
  "uuid",
  "schema",
  "tlp",
  ...FIELD_ALIASES.reach!,
  "deploy",
];

/** Fields `!=` applies to; reach is a setting, not a property of an object. */
export function supportsNegation(field: string): boolean {
  const key = field.toLowerCase();
  return FILTER_FIELD_KEYS.includes(key) && !FIELD_ALIASES.reach!.includes(key);
}

/** Strip boolean joiners; implicit AND between adjacent clauses is unchanged. */
function stripBooleanJoiners(text: string): string {
  return text
    .replace(/\b(AND|OR)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Includes = Omit<CatalogFilters, "query" | "exclude">;

function includeClause(key: string, raw: string, acc: Includes): void {
  const value = raw.toLowerCase();

  switch (key) {
    case "type":
      if (OBJECT_TYPES.has(value as ObjectType)) {
        acc.types.push(value as ObjectType);
      }
      break;
    case "platform":
      acc.platforms.push(raw);
      break;
    case "status":
      acc.statuses.push(raw.toUpperCase());
      if (value === "staging") acc.stagingOnly = true;
      if (value === "production") acc.productionOnly = true;
      break;
    case "technique":
    case "attack":
    case "att&ck":
      acc.techniques.push(raw.toUpperCase());
      break;
    case "actor":
      acc.actors.push(raw);
      break;
    case "schema":
      acc.schemas.push(raw);
      break;
    case "tlp":
      acc.tlps.push(raw.toUpperCase());
      break;
    case "uuid":
      acc.uuid = raw;
      break;
    case "reach":
    case "relation":
    case "mode": {
      const mode = parseReach(raw);
      if (mode) acc.relationMode = mode;
      break;
    }
    case "deploy":
      if (value === "staging") acc.stagingOnly = true;
      if (value === "production") acc.productionOnly = true;
      break;
  }
}

function excludeClause(key: string, raw: string, ex: ExcludedValues): void {
  const value = raw.toLowerCase();

  switch (key) {
    case "type":
      if (OBJECT_TYPES.has(value as ObjectType)) {
        ex.types.push(value as ObjectType);
      }
      break;
    case "platform":
      ex.platforms.push(raw);
      break;
    case "status":
      ex.statuses.push(raw.toUpperCase());
      break;
    case "technique":
    case "attack":
    case "att&ck":
      ex.techniques.push(raw.toUpperCase());
      break;
    case "actor":
      ex.actors.push(raw);
      break;
    case "schema":
      ex.schemas.push(raw);
      break;
    case "tlp":
      ex.tlps.push(raw.toUpperCase());
      break;
    case "uuid":
      ex.uuids.push(raw);
      break;
    case "deploy":
      if (value === "staging" || value === "production") ex.deploy.push(value);
      break;
  }
}

/**
 * Parse search input into structured catalogue filters: `field:value` keeps objects with the
 * value, `field!=value` drops them, quoted values may hold spaces, and AND/OR join clauses.
 * Everything else is free text, including words like `chain` or `staging`: reach and
 * deployment are clauses (`reach:chains`, `deploy:staging`).
 */
export function parseFilterTokens(input: string): CatalogFilters {
  const acc: Includes = {
    types: [],
    platforms: [],
    statuses: [],
    techniques: [],
    actors: [],
    schemas: [],
    tlps: [],
    uuid: "",
    relationMode: DEFAULT_FILTERS.relationMode,
    stagingOnly: false,
    productionOnly: false,
  };
  const exclude = emptyExclusions();

  // A clause is a whole space-delimited token: `subtype:rule` is text, not a type.
  const clauseRe = new RegExp(
    `(^|\\s)(${FILTER_FIELD_KEYS.map(escapeRegExp).join("|")})(:|!=)([^\\s"]+|"[^"]+")(?=\\s|$)`,
    "gi",
  );

  // The free text is what is left once the clauses are cut out.
  let text = "";
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = clauseRe.exec(input)) !== null) {
    const key = match[2]!.toLowerCase();
    const op = match[3] as ClauseOperator;
    const raw = match[4]!.replace(/^"|"$/g, "");

    if (op === ":") includeClause(key, raw, acc);
    else if (supportsNegation(key)) excludeClause(key, raw, exclude);
    // `reach!=…` means nothing: leave it in the text, where it matches nothing, rather
    // than drop it without a word.
    else continue;

    text += `${input.slice(from, match.index + match[1]!.length)} `;
    from = match.index + match[0].length;
  }
  text += input.slice(from);

  // Incomplete tokens (field: with no value) stay in the string — strip them.
  const query = stripBooleanJoiners(text)
    .replace(/\b[\w&]+(:|!=)(?=\s|$)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { query, ...acc, exclude };
}

function exclusionCount(exclude: ExcludedValues): number {
  return Object.values(exclude).reduce(
    (sum, values: unknown[]) => sum + values.length,
    0,
  );
}

export function activeFilterCount(filters: CatalogFilters): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.uuid) count += 1;
  count += filters.types.length;
  count += filters.platforms.length;
  count += filters.statuses.length;
  count += filters.techniques.length;
  count += filters.actors.length;
  count += filters.schemas.length;
  count += filters.tlps.length;
  if (filters.relationMode !== DEFAULT_FILTERS.relationMode) count += 1;
  if (filters.stagingOnly) count += 1;
  if (filters.productionOnly) count += 1;
  count += exclusionCount(filters.exclude);
  return count;
}

function clauseText(field: string, op: ClauseOperator, value: string): string {
  return `${field}${op}${/\s/.test(value) ? `"${value}"` : value}`;
}

/** Serialize structured filters back into search input that parses to the same filters. */
export function formatFilterTokens(filters: CatalogFilters): string {
  const parts: string[] = [];
  const add = (field: string, op: ClauseOperator, values: string[]) => {
    for (const value of values) parts.push(clauseText(field, op, value));
  };

  add("type", ":", filters.types);
  add("platform", ":", filters.platforms);
  add(
    "status",
    ":",
    filters.statuses.filter(
      (s) =>
        !(s === "STAGING" && filters.stagingOnly) &&
        !(s === "PRODUCTION" && filters.productionOnly),
    ),
  );
  add("technique", ":", filters.techniques);
  add("actor", ":", filters.actors);
  add("schema", ":", filters.schemas);
  add("tlp", ":", filters.tlps);
  if (filters.uuid) add("uuid", ":", [filters.uuid]);
  if (filters.stagingOnly) {
    add(filters.statuses.includes("STAGING") ? "status" : "deploy", ":", [
      "staging",
    ]);
  }
  if (filters.productionOnly) {
    add(filters.statuses.includes("PRODUCTION") ? "status" : "deploy", ":", [
      "production",
    ]);
  }
  if (filters.relationMode !== DEFAULT_FILTERS.relationMode) {
    add("reach", ":", [REACH_VALUE[filters.relationMode]]);
  }

  const ex = filters.exclude;
  add("type", "!=", ex.types);
  add("platform", "!=", ex.platforms);
  add("status", "!=", ex.statuses);
  add("technique", "!=", ex.techniques);
  add("actor", "!=", ex.actors);
  add("schema", "!=", ex.schemas);
  add("tlp", "!=", ex.tlps);
  add("uuid", "!=", ex.uuids);
  add("deploy", "!=", ex.deploy);

  if (filters.query.trim()) parts.push(filters.query.trim());

  return parts.join(" ");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches `field:value` (any alias of the field, quoted or not) as a whole token. */
function clausePattern(
  field: string,
  value: string,
  op: ClauseOperator,
): RegExp {
  const names = (FIELD_ALIASES[field] ?? [field]).map(escapeRegExp).join("|");
  const v = escapeRegExp(value);
  return new RegExp(
    `(^|\\s)(?:${names})${escapeRegExp(op)}(?:"${v}"|${v})(?=\\s|$)`,
    "i",
  );
}

export function hasClause(
  query: string,
  field: string,
  value: string,
  op: ClauseOperator = ":",
): boolean {
  return clausePattern(field, value, op).test(query);
}

/** Add `field:value` (or `field!=value`) to a search, or take it out when it is there. */
export function toggleClause(
  query: string,
  field: string,
  value: string,
  op: ClauseOperator = ":",
): string {
  const pattern = clausePattern(field, value, op);
  if (pattern.test(query)) {
    return query
      .replace(new RegExp(pattern.source, "gi"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return `${query.trim()} ${clauseText(field, op, value)}`.trim();
}

/** Remove the free-text part of a search and keep its clauses. */
export function withoutFreeText(
  query: string,
  filters: CatalogFilters,
): string {
  const free = filters.query.trim();
  if (!free) return query;
  let next = query;
  for (const word of free.split(/\s+/)) {
    next = next.replace(
      new RegExp(`(^|\\s)${escapeRegExp(word)}(?=\\s|$)`, "i"),
      " ",
    );
  }
  return next.replace(/\s+/g, " ").trim();
}

/** Remove a deployment filter however it was written: `deploy:` or `status:`. */
export function withoutDeploy(query: string, which: DeployTarget): string {
  return query
    .replace(
      new RegExp(`(^|\\s)(?:deploy|status):${which}(?=\\s|$)`, "gi"),
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Set how far matches reach: replaces any `reach:` clause; the default needs none. */
export function withReach(query: string, mode: RelationMode): string {
  const names = FIELD_ALIASES.reach!.join("|");
  const stripped = query
    .replace(new RegExp(`(^|\\s)(?:${names}):\\S+(?=\\s|$)`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
  if (mode === DEFAULT_FILTERS.relationMode) return stripped;
  return `${stripped} reach:${REACH_VALUE[mode]}`.trim();
}
