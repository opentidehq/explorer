import type { ObjectType } from "@/lib/opentide/types";

export interface CatalogFilters {
  query: string;
  types: ObjectType[];
  platforms: string[];
  statuses: string[];
  techniques: string[];
  actors: string[];
  uuid: string;
  relationMode: "match-only" | "include-neighbors" | "include-chain";
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
  uuid: "",
  relationMode: "include-neighbors",
  stagingOnly: false,
  productionOnly: false,
};

export function parseFilterTokens(input: string): Partial<CatalogFilters> {
  const parsed: Partial<CatalogFilters> = {};
  const types: ObjectType[] = [];
  const platforms: string[] = [];
  const statuses: string[] = [];
  const techniques: string[] = [];
  const actors: string[] = [];

  let query = input;

  const tokenRe =
    /(type|platform|status|technique|actor|uuid):([^\s"]+|"[^"]+")/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(input)) !== null) {
    const key = match[1]!.toLowerCase();
    const raw = match[2]!.replace(/^"|"$/g, "");
    const value = raw.toLowerCase();

    switch (key) {
      case "type":
        if (
          value === "threat" ||
          value === "objective" ||
          value === "signal" ||
          value === "rule"
        ) {
          types.push(value);
        }
        break;
      case "platform":
        platforms.push(raw);
        break;
      case "status":
        statuses.push(raw.toUpperCase());
        break;
      case "technique":
        techniques.push(raw.toUpperCase());
        break;
      case "actor":
        actors.push(raw);
        break;
      case "uuid":
        parsed.uuid = raw;
        break;
    }
    query = query.replace(match[0], "").trim();
  }

  if (types.length) parsed.types = types;
  if (platforms.length) parsed.platforms = platforms;
  if (statuses.length) parsed.statuses = statuses;
  if (techniques.length) parsed.techniques = techniques;
  if (actors.length) parsed.actors = actors;
  parsed.query = query.trim();

  return parsed;
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
  if (filters.stagingOnly) count += 1;
  if (filters.productionOnly) count += 1;
  return count;
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
  };
}
