import type { ExplorerBundle, ObjectType } from "@/lib/opentide/types";
import { collectFilterOptions } from "@/lib/search/orama";
import {
  formatVocabDisplayName,
  lookupVocabTerm,
  type VocabIndex,
} from "@/lib/opentide/vocab";

/** Searchable filter fields exposed as `field:value` tokens. */
export interface SearchFieldDef {
  key: string;
  label: string;
  description: string;
  aliases?: string[];
}

export const SEARCH_FIELDS: SearchFieldDef[] = [
  {
    key: "type",
    label: "type",
    description: "Object type (threat, objective, signal, rule)",
  },
  {
    key: "platform",
    label: "platform",
    description: "Detection platform (sentinel, splunk, …)",
  },
  {
    key: "status",
    label: "status",
    description: "Deployment status (STAGING, PRODUCTION)",
  },
  {
    key: "technique",
    label: "technique",
    description: "MITRE ATT&CK technique ID",
    aliases: ["attack", "att&ck"],
  },
  {
    key: "actor",
    label: "actor",
    description: "Threat actor name",
  },
  {
    key: "uuid",
    label: "uuid",
    description: "Object UUID",
  },
  {
    key: "schema",
    label: "schema",
    description: "Schema identifier (threat::1.0, …)",
  },
  {
    key: "tlp",
    label: "tlp",
    description: "Traffic Light Protocol label",
  },
  {
    key: "relation",
    label: "relation",
    description: "Graph expansion (neighbors, chain, match-only)",
    aliases: ["mode"],
  },
  {
    key: "deploy",
    label: "deploy",
    description: "Deployment filter (staging, production)",
  },
  {
    key: "staging",
    label: "staging",
    description: "Objects with staging deployments",
  },
  {
    key: "production",
    label: "production",
    description: "Objects with production deployments",
  },
];

export const RELATION_VALUES = [
  {
    value: "neighbors",
    label: "neighbors",
    description: "Include direct neighbors",
  },
  { value: "chain", label: "chain", description: "Include detection chain" },
  {
    value: "match-only",
    label: "match-only",
    description: "Matches only, no expansion",
  },
  {
    value: "detection-chain",
    label: "detection-chain",
    description: "Alias for chain",
  },
] as const;

const OBJECT_TYPES: ObjectType[] = ["threat", "objective", "signal", "rule"];

const COMMON_STATUSES = ["STAGING", "PRODUCTION", "DRAFT", "DEPRECATED"];
const COMMON_TLP = ["CLEAR", "GREEN", "AMBER", "AMBER+STRICT", "RED"];
const COMMON_SCHEMAS = [
  "threat::1.0",
  "objective::1.0",
  "signal::1.0",
  "rule::1.0",
];

export interface TokenValueHint {
  label: string;
  description?: string;
}

export interface TokenVocabulary {
  types: string[];
  platforms: string[];
  statuses: string[];
  techniques: string[];
  actors: string[];
  schemas: string[];
  tlps: string[];
  relations: string[];
  deploy: string[];
  /** Enriched display labels and descriptions keyed by corpus token value. */
  valueHints: Partial<Record<string, Record<string, TokenValueHint>>>;
}

export function buildTokenVocabulary(bundle: ExplorerBundle): TokenVocabulary {
  const fromCorpus = collectFilterOptions(bundle);
  const schemas = new Set<string>(COMMON_SCHEMAS);
  const tlps = new Set<string>(COMMON_TLP);
  const statuses = new Set<string>([
    ...COMMON_STATUSES,
    ...fromCorpus.statuses,
  ]);

  for (const summary of bundle.summaries) {
    if (summary.schema) schemas.add(summary.schema);
    if (summary.tlp) tlps.add(summary.tlp.toUpperCase());
  }

  return {
    types: [...new Set([...OBJECT_TYPES, ...fromCorpus.types])].toSorted(),
    platforms: fromCorpus.platforms,
    statuses: [...statuses].toSorted(),
    techniques: fromCorpus.techniques,
    actors: fromCorpus.actors,
    schemas: [...schemas].toSorted(),
    tlps: [...tlps].toSorted(),
    relations: RELATION_VALUES.map((r) => r.value),
    deploy: ["staging", "production"],
    valueHints: {},
  };
}

function hintFromTerm(term: {
  name: string;
  description?: string;
}): TokenValueHint {
  return {
    label: formatVocabDisplayName(term.name),
    description: term.description?.trim() || undefined,
  };
}

/** Attach vocab-backed labels and descriptions for searchable token values. */
export function enrichTokenVocabulary(
  vocab: TokenVocabulary,
  index: VocabIndex,
): TokenVocabulary {
  const valueHints: TokenVocabulary["valueHints"] = {};

  const actorHints: Record<string, TokenValueHint> = {};
  for (const actor of vocab.actors) {
    const term = lookupVocabTerm(index, "actors", actor);
    if (term) actorHints[actor] = hintFromTerm(term);
  }
  if (Object.keys(actorHints).length) valueHints.actor = actorHints;

  const techniqueHints: Record<string, TokenValueHint> = {};
  for (const technique of vocab.techniques) {
    const term = lookupVocabTerm(index, "att&ck", technique);
    if (term) techniqueHints[technique] = hintFromTerm(term);
  }
  if (Object.keys(techniqueHints).length) {
    valueHints.technique = techniqueHints;
    valueHints.attack = techniqueHints;
    valueHints["att&ck"] = techniqueHints;
  }

  return { ...vocab, valueHints };
}

export function valuesForField(
  field: string,
  vocab: TokenVocabulary,
): Array<{ value: string; label?: string; description?: string }> {
  const key = field.toLowerCase();
  const hints = vocab.valueHints[key];

  const withHints = (values: string[]) =>
    values.map((value) => {
      const hint = hints?.[value];
      return {
        value,
        label: hint?.label,
        description: hint?.description,
      };
    });

  switch (key) {
    case "type":
      return vocab.types.map((v) => ({ value: v }));
    case "platform":
      return vocab.platforms.map((v) => ({ value: v }));
    case "status":
      return vocab.statuses.map((v) => ({ value: v }));
    case "technique":
    case "attack":
    case "att&ck":
      return withHints(vocab.techniques);
    case "actor":
      return withHints(vocab.actors);
    case "schema":
      return vocab.schemas.map((v) => ({ value: v }));
    case "tlp":
      return vocab.tlps.map((v) => ({ value: v }));
    case "relation":
    case "mode":
      return RELATION_VALUES.map((r) => ({
        value: r.value,
        description: r.description,
      }));
    case "deploy":
      return vocab.deploy.map((v) => ({ value: v }));
    case "staging":
    case "production":
      return [];
    default:
      return [];
  }
}

export function matchFields(partial: string): SearchFieldDef[] {
  const q = partial.toLowerCase();
  if (!q) return SEARCH_FIELDS;
  return SEARCH_FIELDS.filter(
    (f) =>
      f.key.startsWith(q) ||
      f.label.startsWith(q) ||
      f.aliases?.some((a) => a.startsWith(q)),
  );
}
