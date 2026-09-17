/**
 * Field registry — re-exports generated pins + path helper.
 * Regenerate: pnpm codegen:specs
 */
export {
  FIELD_REGISTRY,
  type FieldDefinition,
  type FieldFormat,
} from "@/lib/opentide/generated/field-registry";

import { flattenReferences } from "@/lib/opentide/vocab";

const REF_KEYS = ["name", "id", "value", "label"] as const;

function isRefKey(part: string): boolean {
  return (REF_KEYS as readonly string[]).includes(part);
}

function projectArrayItem(item: unknown, part: string): unknown[] {
  if (item == null) return [];
  // Primitive list items are the pin value only for identity paths
  // (`threat.actors.name`). Other segments must not steal those strings.
  if (typeof item !== "object") return isRefKey(part) ? [item] : [];
  const record = item as Record<string, unknown>;
  const next = record[part];
  if (typeof next === "string" && next.trim()) return [next.trim()];
  if (next !== undefined && next !== null && next !== "") return [next];
  if (!isRefKey(part)) return [];
  for (const key of REF_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return [candidate.trim()];
    }
  }
  return [];
}

function getValueAtPath(body: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = body;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      current = current.flatMap((item) => projectArrayItem(item, part));
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const FIELD_PATH_FALLBACKS: Record<string, string[]> = {
  "objective.composition.strategy": ["composition.strategy"],
  "objective.composition.description": ["composition.description"],
  author: ["metadata.author"],
  "metadata.author": ["author"],
  status: ["_status"],
  techniques: ["_techniques"],
  "threat.actors.name": ["threat.actors"],
  "threat.surface": ["threat.terrain"],
};

/** Collect ATT&CK technique IDs from rule body and platform alert blocks. */
export function collectRuleTechniques(body: Record<string, unknown>): string[] {
  const direct = body["techniques"];
  if (Array.isArray(direct) && direct.length > 0) {
    return [
      ...new Set(
        direct.filter((item): item is string => typeof item === "string"),
      ),
    ];
  }

  const inherited = body["_techniques"];
  if (Array.isArray(inherited) && inherited.length > 0) {
    return [
      ...new Set(
        inherited.filter((item): item is string => typeof item === "string"),
      ),
    ];
  }

  const configurations = body["configurations"];
  if (!configurations || typeof configurations !== "object") return [];

  const techniques = new Set<string>();
  for (const config of Object.values(
    configurations as Record<string, unknown>,
  )) {
    if (!config || typeof config !== "object") continue;
    const alert = (config as Record<string, unknown>)["alert"];
    if (!alert || typeof alert !== "object") continue;
    const alertTechniques = (alert as Record<string, unknown>)["techniques"];
    if (!Array.isArray(alertTechniques)) continue;
    for (const technique of alertTechniques) {
      if (typeof technique === "string") techniques.add(technique);
    }
  }

  return [...techniques];
}

function hasFieldValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  // Empty projections (e.g. `.name` over string actors) must not block fallbacks.
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** Resolve a registry path, including bundle shapes that omit type prefixes. */
export function resolveFieldValue(
  body: Record<string, unknown>,
  path: string,
): unknown {
  if (path === "techniques") {
    const techniques = collectRuleTechniques(body);
    if (techniques.length > 0) return techniques;
  }

  if (path === "references") {
    const direct = getValueAtPath(body, path);
    const flattened = flattenReferences(direct);
    if (flattened.length > 0) return flattened;
  }

  const direct = getValueAtPath(body, path);
  if (hasFieldValue(direct)) return direct;
  for (const alt of FIELD_PATH_FALLBACKS[path] ?? []) {
    const value = getValueAtPath(body, alt);
    if (hasFieldValue(value)) return value;
  }
  return direct;
}
