import type { ObjectType } from "@/lib/opentide/types";

export type RelationMode = "match-only" | "include-neighbors" | "include-chain";

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
};

const OBJECT_TYPES = new Set<ObjectType>([
  "threat",
  "objective",
  "signal",
  "rule",
]);

const RELATION_ALIASES: Record<string, RelationMode> = {
  match: "match-only",
  "match-only": "match-only",
  matches: "match-only",
  neighbor: "include-neighbors",
  neighbors: "include-neighbors",
  chain: "include-chain",
  "detection-chain": "include-chain",
};

function parseRelationValue(raw: string): RelationMode | undefined {
  const key = raw.toLowerCase().replace(/_/g, "-");
  return RELATION_ALIASES[key];
}

const FILTER_FIELD_KEYS =
  "type|platform|status|technique|actor|uuid|schema|tlp|relation|mode|deploy|staging|production";

/** Strip boolean joiners; implicit AND between adjacent clauses is unchanged. */
function stripBooleanJoiners(text: string): string {
  return text
    .replace(/\b(AND|OR)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyClause(
  key: string,
  raw: string,
  acc: {
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
  },
): void {
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
    case "relation":
    case "mode": {
      const mode = parseRelationValue(raw);
      if (mode) acc.relationMode = mode;
      break;
    }
    case "deploy":
      if (value === "staging") acc.stagingOnly = true;
      if (value === "production") acc.productionOnly = true;
      break;
    case "staging":
      acc.stagingOnly = true;
      break;
    case "production":
      acc.productionOnly = true;
      break;
  }
}

/**
 * Parse tokenized search input into structured catalog filters.
 * Supports `field:value`, `field!=value`, quoted values, AND/OR joiners,
 * and legacy bare relation tokens (`neighbors`, `chain`).
 */
export function parseFilterTokens(input: string): CatalogFilters {
  const acc = {
    types: [] as ObjectType[],
    platforms: [] as string[],
    statuses: [] as string[],
    techniques: [] as string[],
    actors: [] as string[],
    schemas: [] as string[],
    tlps: [] as string[],
    uuid: "",
    relationMode: DEFAULT_FILTERS.relationMode as RelationMode,
    stagingOnly: false,
    productionOnly: false,
  };

  let query = stripBooleanJoiners(input);

  const clauseRe = new RegExp(
    `\\b(${FILTER_FIELD_KEYS})(:|!=)([^\\s"]+|"[^"]+")`,
    "gi",
  );

  let match: RegExpExecArray | null;
  while ((match = clauseRe.exec(input)) !== null) {
    const key = match[1]!.toLowerCase();
    const op = match[2] as ":" | "!=";
    const raw = match[3]!.replace(/^"|"$/g, "");

    if (op === ":") {
      applyClause(key, raw, acc);
    }
    // != negation is accepted in the grammar; filter application is future work.

    query = query.replace(match[0], "").trim();
  }

  const bareRelationRe = /\b(match-only|neighbors?|chain|detection-chain)\b/gi;
  let relationMatch: RegExpExecArray | null;
  while ((relationMatch = bareRelationRe.exec(query)) !== null) {
    const mode = parseRelationValue(relationMatch[1]!);
    if (mode) acc.relationMode = mode;
    query = query.replace(relationMatch[0], "").trim();
  }

  if (/\bstaging\b/i.test(query)) {
    acc.stagingOnly = true;
    query = query.replace(/\bstaging\b/gi, "").trim();
  }
  if (/\bproduction\b/i.test(query)) {
    acc.productionOnly = true;
    query = query.replace(/\bproduction\b/gi, "").trim();
  }

  query = stripBooleanJoiners(query);

  // Incomplete tokens (field: with no value) stay in the string — strip them.
  query = query.replace(/\b[\w&]+(:|!=)(?=\s|$)/gi, "").trim();

  return {
    query: query.trim(),
    types: acc.types,
    platforms: acc.platforms,
    statuses: acc.statuses,
    techniques: acc.techniques,
    actors: acc.actors,
    schemas: acc.schemas,
    tlps: acc.tlps,
    uuid: acc.uuid,
    relationMode: acc.relationMode,
    stagingOnly: acc.stagingOnly,
    productionOnly: acc.productionOnly,
  };
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
  return count;
}

/** Serialize structured filters back into token search input. */
export function formatFilterTokens(filters: CatalogFilters): string {
  const parts: string[] = [];

  for (const type of filters.types) parts.push(`type:${type}`);
  for (const platform of filters.platforms) parts.push(`platform:${platform}`);
  for (const status of filters.statuses) parts.push(`status:${status}`);
  for (const technique of filters.techniques)
    parts.push(`technique:${technique}`);
  for (const actor of filters.actors) parts.push(`actor:${actor}`);
  for (const schema of filters.schemas) parts.push(`schema:${schema}`);
  for (const tlp of filters.tlps) parts.push(`tlp:${tlp}`);
  if (filters.uuid) parts.push(`uuid:${filters.uuid}`);
  if (filters.stagingOnly) parts.push("staging");
  if (filters.productionOnly) parts.push("production");
  if (filters.relationMode !== DEFAULT_FILTERS.relationMode) {
    parts.push(filters.relationMode);
  }
  if (filters.query.trim()) parts.push(filters.query.trim());

  return parts.join(" ");
}

export function mergeFilters(
  base: CatalogFilters,
  patch: Partial<CatalogFilters>,
): CatalogFilters {
  return {
    ...base,
    ...patch,
    types: patch.types ?? base.types,
    platforms: patch.platforms ?? base.platforms,
    statuses: patch.statuses ?? base.statuses,
    techniques: patch.techniques ?? base.techniques,
    actors: patch.actors ?? base.actors,
    schemas: patch.schemas ?? base.schemas,
    tlps: patch.tlps ?? base.tlps,
  };
}
