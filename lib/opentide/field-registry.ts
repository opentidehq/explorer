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

export function getValueAtPath(
  body: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = body;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
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
  if (direct != null && direct !== "") return direct;
  for (const alt of FIELD_PATH_FALLBACKS[path] ?? []) {
    const value = getValueAtPath(body, alt);
    if (value != null && value !== "") return value;
  }
  return direct;
}
