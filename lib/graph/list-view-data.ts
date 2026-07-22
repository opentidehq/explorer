import { getCausalChain, type CorpusGraph } from "@/lib/graph/corpus-graph";
import {
  childs,
  getType,
  parents,
  type GraphContext,
} from "@/lib/opentide/graph";
import type { BundleObjectSummary, ObjectType } from "@/lib/opentide/types";

export type CoverageCounts = Partial<Record<ObjectType, number>>;

export interface ListViewItem {
  id: string;
  name: string;
  type: "threat" | "objective" | "signal" | "rule";
}

export interface ListViewLink {
  sourceId: string;
  targetId: string;
  kind: "threat-objective" | "objective-rule" | "objective-signal";
}

export interface ListViewObjectiveRow {
  objective: ListViewItem;
  threatIds: string[];
  signalIds: string[];
  ruleIds: string[];
}

export interface ListViewModel {
  threats: ListViewItem[];
  objectives: ListViewObjectiveRow[];
  rules: ListViewItem[];
  links: ListViewLink[];
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].toSorted((a, b) => a.name.localeCompare(b.name));
}

function toItem(summary: BundleObjectSummary): ListViewItem {
  return { id: summary.uuid, name: summary.name, type: summary.type };
}

function visibleSummaries(
  summaries: BundleObjectSummary[],
  visibleIds: Set<string>,
  type: BundleObjectSummary["type"],
): BundleObjectSummary[] {
  return summaries.filter((s) => s.type === type && visibleIds.has(s.uuid));
}

function threatIdsForObjective(
  ctx: GraphContext,
  objectiveId: string,
): string[] {
  const fromParents = parents(ctx, objectiveId).filter(
    (id) => getType(ctx, id, true) === "threat",
  );
  if (fromParents.length > 0) return fromParents;

  const body = ctx.models.objective?.[objectiveId];
  const section = body?.["objective"] as Record<string, unknown> | undefined;
  const threats = section?.["threats"];
  if (Array.isArray(threats)) {
    return threats.filter((t): t is string => typeof t === "string");
  }
  return [];
}

function rulesForObjective(ctx: GraphContext, objectiveId: string): string[] {
  const rules = new Set<string>();
  for (const child of childs(ctx, objectiveId)) {
    const childType = getType(ctx, child, true);
    if (childType === "rule") rules.add(child);
    if (childType === "signal") {
      for (const ruleId of childs(ctx, child)) {
        if (getType(ctx, ruleId, true) === "rule") rules.add(ruleId);
      }
    }
  }
  return [...rules];
}

function signalsForObjective(ctx: GraphContext, objectiveId: string): string[] {
  return childs(ctx, objectiveId).filter(
    (id) => getType(ctx, id, true) === "signal",
  );
}

/** Build sorted three-column list model and connector edges for visible corpus objects. */
export function buildListViewModel(
  ctx: GraphContext,
  summaries: BundleObjectSummary[],
  visibleIds: Set<string>,
): ListViewModel {
  const summaryById = new Map(summaries.map((s) => [s.uuid, s]));
  const threats = sortByName(
    visibleSummaries(summaries, visibleIds, "threat").map(toItem),
  );
  const threatIdSet = new Set(threats.map((t) => t.id));

  const objectiveSummaries = sortByName(
    visibleSummaries(summaries, visibleIds, "objective"),
  );

  const objectives: ListViewObjectiveRow[] = [];
  const ruleIdSet = new Set<string>();
  const links: ListViewLink[] = [];

  for (const summary of objectiveSummaries) {
    const threatIds = threatIdsForObjective(ctx, summary.uuid).filter(
      (id) =>
        visibleIds.has(id) && (threatIdSet.size === 0 || threatIdSet.has(id)),
    );
    const signalIds = signalsForObjective(ctx, summary.uuid).filter((id) =>
      visibleIds.has(id),
    );
    const ruleIds = rulesForObjective(ctx, summary.uuid).filter((id) =>
      visibleIds.has(id),
    );

    for (const ruleId of ruleIds) ruleIdSet.add(ruleId);

    const objective = toItem(summary);
    objectives.push({
      objective,
      threatIds,
      signalIds,
      ruleIds,
    });

    for (const threatId of threatIds) {
      links.push({
        sourceId: threatId,
        targetId: objective.id,
        kind: "threat-objective",
      });
    }
    for (const signalId of signalIds) {
      links.push({
        sourceId: objective.id,
        targetId: signalId,
        kind: "objective-signal",
      });
    }
    for (const ruleId of ruleIds) {
      links.push({
        sourceId: objective.id,
        targetId: ruleId,
        kind: "objective-rule",
      });
    }
  }

  const rules = sortByName(
    [...ruleIdSet]
      .map((id) => summaryById.get(id))
      .filter((s): s is BundleObjectSummary => s != null)
      .map(toItem),
  );

  return { threats, objectives, rules, links };
}

function isObjectiveRowInFocus(
  row: ListViewObjectiveRow,
  focusIds: Set<string>,
): boolean {
  if (focusIds.has(row.objective.id)) return true;
  return row.signalIds.some((signalId) => focusIds.has(signalId));
}

function sortObjectiveRowsByFocus(
  rows: ListViewObjectiveRow[],
  focusIds: Set<string>,
): ListViewObjectiveRow[] {
  return [...rows].toSorted((a, b) => {
    const aFocus = isObjectiveRowInFocus(a, focusIds);
    const bFocus = isObjectiveRowInFocus(b, focusIds);
    if (aFocus !== bFocus) return aFocus ? -1 : 1;
    return a.objective.name.localeCompare(b.objective.name);
  });
}

/** Causal-chain neighborhood for LIST hover preview (same logic as click filter). */
export function getRelatedIdsForPreview(
  corpus: CorpusGraph,
  nodeId: string,
): Set<string> {
  return getCausalChain(corpus, nodeId).nodes;
}

/** Move causal-chain members to the top of each column; keep all visible rows. */
export function applyListViewFocus(
  model: ListViewModel,
  focusIds: Set<string> | null,
): ListViewModel {
  if (!focusIds) return model;

  return {
    ...model,
    threats: sortItemsByFocus(model.threats, focusIds),
    rules: sortItemsByFocus(model.rules, focusIds),
    objectives: sortObjectiveRowsByFocus(model.objectives, focusIds),
  };
}

function sortItemsByFocus<T extends ListViewItem>(
  items: T[],
  focusIds: Set<string>,
): T[] {
  return [...items].toSorted((a, b) => {
    const aFocus = focusIds.has(a.id);
    const bFocus = focusIds.has(b.id);
    if (aFocus !== bFocus) return aFocus ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function coverageForThreat(
  threatId: string,
  model: ListViewModel,
): CoverageCounts {
  const rows = model.objectives.filter((row) =>
    row.threatIds.includes(threatId),
  );
  const ruleIds = new Set<string>();
  for (const row of rows) {
    for (const ruleId of row.ruleIds) ruleIds.add(ruleId);
  }
  return {
    objective: rows.length,
    rule: ruleIds.size,
  };
}

export function coverageForObjective(
  row: ListViewObjectiveRow,
): CoverageCounts {
  return {
    threat: row.threatIds.length,
    signal: row.signalIds.length,
    rule: row.ruleIds.length,
  };
}

export function coverageForRule(
  ruleId: string,
  model: ListViewModel,
): CoverageCounts {
  const rows = model.objectives.filter((row) => row.ruleIds.includes(ruleId));
  const threatIds = new Set<string>();
  const signalIds = new Set<string>();
  for (const row of rows) {
    for (const threatId of row.threatIds) threatIds.add(threatId);
    for (const signalId of row.signalIds) signalIds.add(signalId);
  }
  return {
    objective: rows.length,
    threat: threatIds.size,
    signal: signalIds.size,
  };
}
