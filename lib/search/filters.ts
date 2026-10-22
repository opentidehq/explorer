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
  uuids: string[];
  relationMode: RelationMode;
  stagingOnly: boolean;
  productionOnly: boolean;
  exclude: ExcludedValues;
  /**
   * Explicit AND/OR, empty when the search has neither; the fields above are then the whole
   * search. Otherwise an object matches when any group matches, and a group when every one of
   * its parts does, and the fields above hold every clause together, for chips and counts.
   */
  groups: ClauseSet[][];
}

/** One run of clauses and words between explicit AND/OR. */
export type ClauseSet = Omit<CatalogFilters, "relationMode" | "groups">;

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
  uuids: [],
  relationMode: "include-neighbors",
  stagingOnly: false,
  productionOnly: false,
  exclude: emptyExclusions(),
  groups: [],
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

function emptyClauseSet(): ClauseSet {
  return {
    query: "",
    types: [],
    platforms: [],
    statuses: [],
    techniques: [],
    actors: [],
    schemas: [],
    tlps: [],
    uuids: [],
    stagingOnly: false,
    productionOnly: false,
    exclude: emptyExclusions(),
  };
}

/** The search settings a clause can change beside its clause set. */
interface Settings {
  relationMode: RelationMode;
}

/** Apply `key:raw`; false when the value means nothing for the field, so it stays text. */
function includeClause(
  key: string,
  raw: string,
  acc: ClauseSet,
  settings: Settings,
): boolean {
  const value = raw.toLowerCase();

  switch (key) {
    case "type":
      if (!OBJECT_TYPES.has(value as ObjectType)) return false;
      acc.types.push(value as ObjectType);
      return true;
    case "platform":
      acc.platforms.push(raw);
      return true;
    case "status":
      acc.statuses.push(raw.toUpperCase());
      if (value === "staging") acc.stagingOnly = true;
      if (value === "production") acc.productionOnly = true;
      return true;
    case "technique":
    case "attack":
    case "att&ck":
      acc.techniques.push(raw.toUpperCase());
      return true;
    case "actor":
      acc.actors.push(raw);
      return true;
    case "schema":
      acc.schemas.push(raw);
      return true;
    case "tlp":
      acc.tlps.push(raw.toUpperCase());
      return true;
    case "uuid":
      acc.uuids.push(raw);
      return true;
    case "reach":
    case "relation":
    case "mode": {
      const mode = parseReach(raw);
      if (!mode) return false;
      settings.relationMode = mode;
      return true;
    }
    case "deploy":
      if (value === "staging") acc.stagingOnly = true;
      else if (value === "production") acc.productionOnly = true;
      else return false;
      return true;
  }
  return false;
}

/** Apply `key!=raw`; false when the value means nothing for the field, so it stays text. */
function excludeClause(key: string, raw: string, ex: ExcludedValues): boolean {
  const value = raw.toLowerCase();

  switch (key) {
    case "type":
      if (!OBJECT_TYPES.has(value as ObjectType)) return false;
      ex.types.push(value as ObjectType);
      return true;
    case "platform":
      ex.platforms.push(raw);
      return true;
    case "status":
      ex.statuses.push(raw.toUpperCase());
      return true;
    case "technique":
    case "attack":
    case "att&ck":
      ex.techniques.push(raw.toUpperCase());
      return true;
    case "actor":
      ex.actors.push(raw);
      return true;
    case "schema":
      ex.schemas.push(raw);
      return true;
    case "tlp":
      ex.tlps.push(raw.toUpperCase());
      return true;
    case "uuid":
      ex.uuids.push(raw);
      return true;
    case "deploy":
      if (value !== "staging" && value !== "production") return false;
      ex.deploy.push(value);
      return true;
  }
  // `reach!=…` means nothing: it stays in the text, where it matches nothing, rather than
  // being dropped without a word.
  return false;
}

/**
 * Space-delimited tokens; a quoted run is part of its token whatever it holds, so
 * `actor:"APT 29"` and `"command and control"` are one token each.
 */
const TOKEN_RE = /(?:[^\s"]+|"[^"]*"?)+/g;

const JOINER_RE = /^(?:and|or)$/i;

/** A whole token that is a clause: a known field, an operator and a value. */
const CLAUSE_RE = new RegExp(
  `^(${FILTER_FIELD_KEYS.map(escapeRegExp).join("|")})(:|!=)([^\\s"]+|"[^"]+")$`,
  "i",
);

/** A field and operator with no value yet: being typed, so neither clause nor text. */
const INCOMPLETE_RE = /^[\w&]+(:|!=)$/;

function tokensOf(input: string): string[] {
  return [...input.matchAll(TOKEN_RE)].map(([token]) => token);
}

/** Apply a token as a clause; false when it is not one, or names a value that means nothing. */
function applyClause(
  token: string,
  acc: ClauseSet,
  settings: Settings,
): boolean {
  const match = CLAUSE_RE.exec(token);
  if (!match) return false;
  const key = match[1]!.toLowerCase();
  const raw = match[3]!.replace(/^"|"$/g, "");
  return match[2] === ":"
    ? includeClause(key, raw, acc, settings)
    : excludeClause(key, raw, acc.exclude);
}

function parseClauseSet(tokens: string[], settings: Settings): ClauseSet {
  const set = emptyClauseSet();
  const text: string[] = [];
  for (const token of tokens) {
    if (applyClause(token, set, settings)) continue;
    if (!INCOMPLETE_RE.test(token)) text.push(token);
  }
  set.query = text.join(" ");
  return set;
}

/** Every clause and word of several clause sets as one, for chips and counts. */
function mergeClauseSets(sets: ClauseSet[]): ClauseSet {
  const merged = emptyClauseSet();
  for (const set of sets) {
    merged.types.push(...set.types);
    merged.platforms.push(...set.platforms);
    merged.statuses.push(...set.statuses);
    merged.techniques.push(...set.techniques);
    merged.actors.push(...set.actors);
    merged.schemas.push(...set.schemas);
    merged.tlps.push(...set.tlps);
    merged.uuids.push(...set.uuids);
    merged.stagingOnly ||= set.stagingOnly;
    merged.productionOnly ||= set.productionOnly;
    for (const key of Object.keys(merged.exclude) as (keyof ExcludedValues)[]) {
      (merged.exclude[key] as string[]).push(...set.exclude[key]);
    }
  }
  merged.query = sets
    .map((set) => set.query)
    .filter(Boolean)
    .join(" ");
  return merged;
}

/** Split tokens at explicit joiners: groups at OR, the parts of a group at AND. */
function splitAtJoiners(tokens: string[]): string[][][] {
  const groups: string[][][] = [[]];
  let part: string[] = [];
  const closePart = () => {
    if (part.length) groups.at(-1)!.push(part);
    part = [];
  };
  for (const token of tokens) {
    if (!JOINER_RE.test(token)) {
      part.push(token);
      continue;
    }
    closePart();
    if (token.toUpperCase() === "OR" && groups.at(-1)!.length) groups.push([]);
  }
  closePart();
  return groups.filter((group) => group.length);
}

/**
 * Parse search input into structured catalogue filters: `field:value` keeps objects with the
 * value, `field!=value` drops them, and quoted values and phrases may hold spaces. Beside each
 * other, clauses of one field match any of their values and clauses of different fields must
 * all match; explicit AND requires both sides and OR either. Everything else is free text,
 * including words like `chain` or `staging` and clauses whose value means nothing for the
 * field (`type:rules`): reach and deployment are clauses (`reach:chains`, `deploy:staging`).
 */
export function parseFilterTokens(input: string): CatalogFilters {
  const settings: Settings = { relationMode: DEFAULT_FILTERS.relationMode };
  const groups = splitAtJoiners(tokensOf(input)).map((group) =>
    group.map((part) => parseClauseSet(part, settings)),
  );
  const flat = mergeClauseSets(groups.flat());
  const explicit = groups.length > 1 || (groups[0]?.length ?? 0) > 1;
  return {
    ...flat,
    relationMode: settings.relationMode,
    groups: explicit ? groups : [],
  };
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
  count += filters.uuids.length;
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

function formatClauseSet(set: ClauseSet): string[] {
  const parts: string[] = [];
  const add = (field: string, op: ClauseOperator, values: string[]) => {
    for (const value of values) parts.push(clauseText(field, op, value));
  };

  add("type", ":", set.types);
  add("platform", ":", set.platforms);
  add(
    "status",
    ":",
    set.statuses.filter(
      (s) =>
        !(s === "STAGING" && set.stagingOnly) &&
        !(s === "PRODUCTION" && set.productionOnly),
    ),
  );
  add("technique", ":", set.techniques);
  add("actor", ":", set.actors);
  add("schema", ":", set.schemas);
  add("tlp", ":", set.tlps);
  add("uuid", ":", set.uuids);
  if (set.stagingOnly) {
    add(set.statuses.includes("STAGING") ? "status" : "deploy", ":", [
      "staging",
    ]);
  }
  if (set.productionOnly) {
    add(set.statuses.includes("PRODUCTION") ? "status" : "deploy", ":", [
      "production",
    ]);
  }

  const ex = set.exclude;
  add("type", "!=", ex.types);
  add("platform", "!=", ex.platforms);
  add("status", "!=", ex.statuses);
  add("technique", "!=", ex.techniques);
  add("actor", "!=", ex.actors);
  add("schema", "!=", ex.schemas);
  add("tlp", "!=", ex.tlps);
  add("uuid", "!=", ex.uuids);
  add("deploy", "!=", ex.deploy);

  if (set.query.trim()) parts.push(set.query.trim());
  return parts;
}

/** Serialize structured filters back into search input that parses to the same filters. */
export function formatFilterTokens(filters: CatalogFilters): string {
  const parts = filters.groups.length
    ? [
        filters.groups
          .map((group) =>
            group.map((set) => formatClauseSet(set).join(" ")).join(" AND "),
          )
          .join(" OR "),
      ]
    : formatClauseSet(filters);
  if (filters.relationMode !== DEFAULT_FILTERS.relationMode) {
    parts.push(clauseText("reach", ":", REACH_VALUE[filters.relationMode]));
  }
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

/**
 * Remove the free-text part of a search and keep its clauses, untouched and in order, with
 * the AND/OR between them. A joiner left with nothing on one side goes; of two that meet,
 * OR stays, since the part between them is gone, not the alternative.
 */
export function withoutFreeText(query: string): string {
  const kept: string[] = [];
  const settings: Settings = { relationMode: DEFAULT_FILTERS.relationMode };
  for (const token of tokensOf(query)) {
    if (JOINER_RE.test(token)) {
      const last = kept.at(-1);
      if (!last) continue;
      if (JOINER_RE.test(last)) {
        if (token.toUpperCase() === "OR") kept[kept.length - 1] = token;
        continue;
      }
      kept.push(token);
    } else if (applyClause(token, emptyClauseSet(), settings)) {
      kept.push(token);
    }
  }
  if (kept.length && JOINER_RE.test(kept.at(-1)!)) kept.pop();
  return kept.join(" ");
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
