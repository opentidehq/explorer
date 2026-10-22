import {
  FIELD_REGISTRY,
  resolveFieldValue,
  type FieldDefinition,
} from "@/lib/opentide/field-registry";
import { buildEnrichedBody } from "@/lib/opentide/metadata-fields";
import type {
  BundleObjectSummary,
  ObjectBody,
  ObjectType,
} from "@/lib/opentide/types";
import { safeHttpUrl } from "@/lib/opentide/safe-href";
import { splitPillValues } from "@/lib/opentide/vocab";

/**
 * An object's spec fields, sorted for the inspector: single values become facts, lists become
 * chips, prose gets its own block. ATT&CK, surface, actors, description and references have
 * dedicated sections and are left out here.
 */

export interface FieldEntry {
  field: FieldDefinition;
  value: unknown;
  values: string[];
}

export interface FieldGroups {
  facts: FieldEntry[];
  lists: FieldEntry[];
  prose: FieldEntry[];
}

/** Paths rendered by their own sections, per type. */
const DEDICATED = new Set([
  "description",
  "threat.description",
  "objective.description",
  "references",
  "threat.surface",
  "threat.terrain",
  "threat.actors",
  "threat.actors.name",
  "threat.att&ck",
  "threat.mitre_attack",
  "objective.attack",
  "objective.mitre_attack",
  "techniques",
  "detection_model",
  "metadata.schema",
  "metadata.version",
  "metadata.tlp",
  "metadata.created",
  "metadata.modified",
  "metadata.author",
  "_status",
]);

function hasValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function fieldGroups(
  summary: BundleObjectSummary,
  body: ObjectBody,
): FieldGroups {
  const enriched = buildEnrichedBody(summary, body);
  const groups: FieldGroups = { facts: [], lists: [], prose: [] };
  const seen = new Set<string>();

  for (const field of FIELD_REGISTRY[summary.type as ObjectType] ?? []) {
    if (DEDICATED.has(field.path) || field.format === "attack") continue;
    // Objective pins also describe their embedded signals; those render with the signal.
    if (
      summary.type === "objective" &&
      field.path.startsWith("objective.signals.")
    )
      continue;
    const value = resolveFieldValue(enriched, field.path);
    if (!hasValue(value)) continue;

    if (field.format === "markdown") {
      if (typeof value === "string" && value.trim()) {
        groups.prose.push({ field, value, values: [value] });
      }
      continue;
    }

    const values =
      field.format === "text" || field.format === "number"
        ? [String(value)]
        : splitPillValues(value);
    if (!values.length) continue;
    const key = `${field.label}:${values.join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = { field, value, values };
    if (values.length === 1 && values[0]!.length <= 48)
      groups.facts.push(entry);
    else groups.lists.push(entry);
  }

  return groups;
}

/** ATT&CK technique ids written on the object itself, whichever key the schema uses. */
export function ownTechniques(
  summary: BundleObjectSummary,
  body: ObjectBody,
): string[] {
  const section =
    summary.type === "threat"
      ? (body["threat"] as ObjectBody | undefined)
      : summary.type === "objective"
        ? (body["objective"] as ObjectBody | undefined)
        : body;
  for (const key of ["mitre_attack", "att&ck", "attack", "techniques"]) {
    const value = section?.[key];
    if (Array.isArray(value) && value.length) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
}

/** The prose that describes an object, wherever its type keeps it. */
export function objectDescription(body: ObjectBody | undefined): string | null {
  if (!body) return null;
  for (const candidate of [
    body["description"],
    (body["threat"] as ObjectBody | undefined)?.["description"],
    (body["objective"] as ObjectBody | undefined)?.["description"],
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

/** First non-empty string at any of the given keys. */
export function firstString(
  body: ObjectBody | undefined,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = body?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The object's file in the corpus repository, at the commit the bundle was built from. */
export function sourceUrl(
  source: { repository: string; ref: string } | undefined,
  path: string | undefined,
): string | null {
  if (!source || !path) return null;
  return safeHttpUrl(`${source.repository}/blob/${source.ref}/${path}`);
}
