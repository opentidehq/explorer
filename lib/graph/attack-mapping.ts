import {
  getType,
  parents,
  techniquesResolver,
  type GraphContext,
} from "@/lib/opentide/graph";
import {
  lookupVocabTerm,
  formatVocabDisplayName,
  type VocabIndex,
  type VocabTerm,
} from "@/lib/opentide/vocab";
import type { BundleObjectSummary } from "@/lib/opentide/types";
import type { CoverageCounts } from "@/lib/graph/list-view-data";

export type AttackObjectRole = "threat" | "objective" | "signal" | "rule";
export type AttackMatrixKind = "Enterprise" | "ICS" | "Mobile";

export interface AttackTechniqueMapping {
  techniqueId: string;
  name: string;
  description?: string;
  tactic: string;
  matrix: AttackMatrixKind;
  objects: Array<{ id: string; name: string; role: AttackObjectRole }>;
}

export interface AttackMatrixModel {
  matrix: AttackMatrixKind;
  versionLabel: string;
  tactics: string[];
  techniques: AttackTechniqueMapping[];
  techniqueById: Map<string, AttackTechniqueMapping>;
}

export const ATTACK_MATRIX_KINDS: AttackMatrixKind[] = [
  "Enterprise",
  "ICS",
  "Mobile",
];

const ENTERPRISE_TACTIC_ORDER = [
  "reconnaissance",
  "resource-development",
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "defense-evasion",
  "credential-access",
  "discovery",
  "lateral-movement",
  "collection",
  "command-and-control",
  "exfiltration",
  "impact",
] as const;

const ICS_TACTIC_ORDER = [
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "evasion",
  "discovery",
  "lateral-movement",
  "collection",
  "command-and-control",
  "inhibit-response-function",
  "impair-process-control",
  "impact",
] as const;

const MOBILE_TACTIC_ORDER = [
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "defense-evasion",
  "credential-access",
  "discovery",
  "lateral-movement",
  "collection",
  "command-and-control",
  "exfiltration",
  "impact",
] as const;

const TACTIC_ORDER_BY_MATRIX: Record<AttackMatrixKind, readonly string[]> = {
  Enterprise: ENTERPRISE_TACTIC_ORDER,
  ICS: ICS_TACTIC_ORDER,
  Mobile: MOBILE_TACTIC_ORDER,
};

const TACTIC_LABELS: Record<string, string> = {
  reconnaissance: "Reconnaissance",
  "resource-development": "Resource Development",
  "initial-access": "Initial Access",
  execution: "Execution",
  persistence: "Persistence",
  "privilege-escalation": "Privilege Escalation",
  "defense-evasion": "Defense Evasion",
  "credential-access": "Credential Access",
  discovery: "Discovery",
  "lateral-movement": "Lateral Movement",
  collection: "Collection",
  "command-and-control": "Command and Control",
  exfiltration: "Exfiltration",
  impact: "Impact",
  evasion: "Evasion",
  "inhibit-response-function": "Inhibit Response Function",
  "impair-process-control": "Impair Process Control",
};

function normalizeTactic(stage: string | undefined): string {
  if (!stage) return "uncategorized";
  const key = stage
    .trim()
    .toLowerCase()
    .replace(/priviledge/g, "privilege")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  return key;
}

function parseMatrixFromName(name: string): AttackMatrixKind | null {
  const bracketMatch = name.match(/^\[(Enterprise|ICS|Mobile)\]/i);
  if (bracketMatch?.[1]) {
    const value = bracketMatch[1].toLowerCase();
    if (value === "ics") return "ICS";
    if (value === "mobile") return "Mobile";
    return "Enterprise";
  }

  // OpenTide vocab prefixes from STIX merge: "Industrial : …", "Mobile : …"
  const colonMatch = name.match(/^(Industrial|Mobile|Enterprise)\s*:/i);
  if (colonMatch?.[1]) {
    const value = colonMatch[1].toLowerCase();
    if (value === "industrial") return "ICS";
    if (value === "mobile") return "Mobile";
    return "Enterprise";
  }

  return null;
}

function parseMatrixFromLink(
  link: string | undefined,
): AttackMatrixKind | null {
  if (!link) return null;
  if (link.includes("/techniques/ics/")) return "ICS";
  if (link.includes("/techniques/mobile/")) return "Mobile";
  if (link.includes("/techniques/enterprise/")) return "Enterprise";
  return null;
}

export function parseAttackMatrix(term: VocabTerm): AttackMatrixKind {
  return (
    parseMatrixFromName(term.name) ??
    parseMatrixFromLink(term.link) ??
    "Enterprise"
  );
}

function techniqueLookupKey(id: string): string {
  return id.trim().toUpperCase();
}

function tacticsFromCompoundKeys(
  bucket: Record<string, VocabTerm>,
  techniqueId: string,
): string[] {
  const normalizedId = techniqueLookupKey(techniqueId);
  const suffix = `::${normalizedId}`;
  const tactics: string[] = [];

  for (const key of Object.keys(bucket)) {
    if (!key.includes("::") || !key.endsWith(suffix)) continue;
    const tactic = key.slice(0, key.length - suffix.length);
    if (!tactic || /^T\d/i.test(tactic)) continue;
    tactics.push(normalizeTactic(tactic));
  }

  return [...new Set(tactics)];
}

function resolveTechniqueTactics(
  index: VocabIndex,
  techniqueId: string,
  term: VocabTerm | undefined,
): string[] {
  const raw = term?.stages?.length
    ? term.stages
    : term?.stage
      ? [term.stage]
      : [];
  if (raw.length) {
    return [...new Set(raw.map(normalizeTactic))];
  }

  const bucket = index["att&ck"];
  if (bucket) {
    const fromKeys = tacticsFromCompoundKeys(bucket, techniqueId);
    if (fromKeys.length) return fromKeys;
  }

  return ["uncategorized"];
}

function resolveTechniqueMeta(
  index: VocabIndex,
  techniqueId: string,
  termHint?: VocabTerm,
): {
  name: string;
  description?: string;
  matrix: AttackMatrixKind;
  tactics: string[];
} {
  const term =
    termHint ??
    lookupVocabTerm(index, "att&ck", techniqueId) ??
    lookupVocabTerm(index, "att&ck", techniqueLookupKey(techniqueId));

  const name = term
    ? formatVocabDisplayName(term.name)
    : techniqueId.toUpperCase();
  const matrix = term ? parseAttackMatrix(term) : "Enterprise";
  const tactics = resolveTechniqueTactics(index, techniqueId, term);

  return {
    name,
    description: term?.description,
    matrix,
    tactics,
  };
}

function listMatrixTechniqueIds(
  index: VocabIndex,
  matrix: AttackMatrixKind,
): string[] {
  const bucket = index["att&ck"];
  if (!bucket) return [];

  const ids: string[] = [];
  for (const [key, term] of Object.entries(bucket)) {
    if (!/^T\d/i.test(key)) continue;
    const techniqueId = techniqueLookupKey(key);
    if (parseAttackMatrix(term) !== matrix) continue;
    ids.push(techniqueId);
  }

  return [...new Set(ids)].toSorted((a, b) => a.localeCompare(b));
}

/** Resolve ATT&CK techniques for an object, including signal inheritance from parent objective. */
export function resolveObjectTechniques(
  ctx: GraphContext,
  summary: BundleObjectSummary,
): string[] {
  if (summary.type === "signal") {
    for (const parentId of parents(ctx, summary.uuid)) {
      if (getType(ctx, parentId, true) === "objective") {
        return techniquesResolver(ctx, parentId, true);
      }
    }
    return summary.techniques;
  }

  if (summary.techniques.length > 0) {
    return summary.techniques;
  }

  return techniquesResolver(ctx, summary.uuid, true);
}

function sortTactics(
  tactics: Iterable<string>,
  matrix: AttackMatrixKind,
): string[] {
  const unique = [...new Set(tactics)];
  const order = TACTIC_ORDER_BY_MATRIX[matrix];
  const uniqueSet = new Set(unique);
  const orderSet = new Set<string>(order);
  const ordered = order.filter((t) => uniqueSet.has(t));
  const rest = unique
    .filter((t) => !orderSet.has(t))
    .toSorted((a, b) =>
      (TACTIC_LABELS[a] ?? a).localeCompare(TACTIC_LABELS[b] ?? b),
    );
  return [...ordered, ...rest];
}

/** Latest ATT&CK version hint from vocab technique links (e.g. attack.mitre.org vX). */
export function detectAttackVersionLabel(index: VocabIndex): string {
  const bucket = index["att&ck"];
  if (!bucket) return "vocabulary";

  let best: { version: string; score: number } | null = null;

  for (const term of Object.values(bucket)) {
    const link = term.link ?? "";
    const match = link.match(/attack\.mitre\.org\/versions\/v([\d.]+)/i);
    if (!match?.[1]) continue;
    const version = match[1];
    const score = version
      .split(".")
      .reduce(
        (acc, part, i) => acc + Number.parseInt(part, 10) * 10 ** (4 - i),
        0,
      );
    if (!best || score > best.score) best = { version, score };
  }

  return best ? `v${best.version}` : "latest";
}

/** Map visible corpus objects onto ATT&CK techniques with inheritance. */
export function buildAttackMatrixModel(
  ctx: GraphContext,
  summaries: BundleObjectSummary[],
  visibleIds: Set<string>,
  vocabIndex: VocabIndex,
  matrix: AttackMatrixKind = "Enterprise",
): AttackMatrixModel {
  const coverage = new Map<
    string,
    Array<{ id: string; name: string; role: AttackObjectRole }>
  >();

  for (const summary of summaries) {
    if (!visibleIds.has(summary.uuid)) continue;
    if (
      summary.type !== "threat" &&
      summary.type !== "objective" &&
      summary.type !== "signal" &&
      summary.type !== "rule"
    ) {
      continue;
    }

    const techniques = resolveObjectTechniques(ctx, summary);
    for (const rawId of techniques) {
      const techniqueId = techniqueLookupKey(rawId);
      const meta = resolveTechniqueMeta(vocabIndex, techniqueId);
      if (meta.matrix !== matrix) continue;

      let objects = coverage.get(techniqueId);
      if (!objects) {
        objects = [];
        coverage.set(techniqueId, objects);
      }

      if (!objects.some((o) => o.id === summary.uuid)) {
        objects.push({
          id: summary.uuid,
          name: summary.name,
          role: summary.type as AttackObjectRole,
        });
      }
    }
  }

  const techniqueById = new Map<string, AttackTechniqueMapping>();
  const placements: AttackTechniqueMapping[] = [];
  const tacticSet = new Set<string>();

  const attackBucket = vocabIndex["att&ck"];
  const techniqueIds = listMatrixTechniqueIds(vocabIndex, matrix);
  for (const techniqueId of techniqueIds) {
    const termHint =
      attackBucket?.[techniqueId] ??
      attackBucket?.[techniqueLookupKey(techniqueId)];
    const meta = resolveTechniqueMeta(vocabIndex, techniqueId, termHint);
    const objects = coverage.get(techniqueId) ?? [];

    const base: AttackTechniqueMapping = {
      techniqueId,
      name: meta.name,
      description: meta.description,
      tactic: meta.tactics[0] ?? "uncategorized",
      matrix,
      objects,
    };
    techniqueById.set(techniqueId, base);

    for (const tactic of meta.tactics) {
      tacticSet.add(tactic);
      placements.push({
        ...base,
        tactic,
      });
    }
  }

  for (const [techniqueId, objects] of coverage) {
    if (techniqueById.has(techniqueId)) continue;
    const meta = resolveTechniqueMeta(vocabIndex, techniqueId);
    if (meta.matrix !== matrix) continue;

    const base: AttackTechniqueMapping = {
      techniqueId,
      name: meta.name,
      description: meta.description,
      tactic: meta.tactics[0] ?? "uncategorized",
      matrix,
      objects,
    };
    techniqueById.set(techniqueId, base);

    for (const tactic of meta.tactics) {
      tacticSet.add(tactic);
      placements.push({ ...base, tactic });
    }
  }

  placements.sort((a, b) => {
    const tacticCmp = a.tactic.localeCompare(b.tactic);
    if (tacticCmp !== 0) return tacticCmp;
    return a.techniqueId.localeCompare(b.techniqueId);
  });

  return {
    matrix,
    versionLabel: detectAttackVersionLabel(vocabIndex),
    tactics: sortTactics(tacticSet, matrix),
    techniques: placements,
    techniqueById,
  };
}

export function formatTacticLabel(tactic: string): string {
  return TACTIC_LABELS[tactic] ?? tactic.replace(/-/g, " ");
}

/** Lucide icon slug per ATT&CK tactic (see attack-matrix-view icon map). */
const TACTIC_ICON_SLUGS: Record<string, string> = {
  reconnaissance: "binoculars",
  "resource-development": "package-plus",
  "initial-access": "door-open",
  execution: "terminal",
  persistence: "repeat",
  "privilege-escalation": "arrow-up-circle",
  "defense-evasion": "ghost",
  "credential-access": "key-round",
  discovery: "scan-search",
  "lateral-movement": "move-horizontal",
  collection: "folder-input",
  "command-and-control": "radio",
  exfiltration: "upload",
  impact: "zap",
  evasion: "eye-off",
  "inhibit-response-function": "shield-off",
  "impair-process-control": "cog",
  uncategorized: "circle-help",
};

export function getTacticIconSlug(tactic: string): string {
  return TACTIC_ICON_SLUGS[tactic] ?? "circle-help";
}

export function techniquesForTactic(
  model: AttackMatrixModel,
  tactic: string,
): AttackTechniqueMapping[] {
  return model.techniques.filter((t) => t.tactic === tactic);
}

export function isTechniqueCovered(technique: AttackTechniqueMapping): boolean {
  return technique.objects.length > 0;
}

export function coverageCountsForTechnique(
  technique: AttackTechniqueMapping,
): CoverageCounts {
  const counts: CoverageCounts = {};
  for (const obj of technique.objects) {
    counts[obj.role] = (counts[obj.role] ?? 0) + 1;
  }
  return counts;
}
