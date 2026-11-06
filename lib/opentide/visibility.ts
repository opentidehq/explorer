/**
 * The visibility export: `opentide generate explorer --include-visibility` writes
 * `explorer.visibility.json` beside the bundle, with the log sources a corpus declares in
 * `.opentide/configurations/visibility.toml`, their columns, and the rules and objectives
 * that use each. It is opt-in, because it says what an organisation cannot see: without the
 * file the explorer has no Visibility view.
 */

export const VISIBILITY_FILE = "explorer.visibility.json";

/** TLP values the export may carry, as FIRST names them. */
export const TLP_VALUES = [
  "clear",
  "green",
  "amber",
  "amber+strict",
  "red",
] as const;
export type Tlp = (typeof TLP_VALUES)[number];

export interface VisibilityColumn {
  name: string;
  type: string;
  description: string;
}

export interface VisibilitySignal {
  objective: string;
  uuid: string;
  name: string;
}

export interface VisibilityLogSource {
  name: string;
  system: string;
  description: string;
  tenants: string[];
  columns: VisibilityColumn[];
  /** Rules whose queries read it. */
  read_by: string[];
  /** Objectives one of whose signals names it. */
  objectives: string[];
  signals: VisibilitySignal[];
  /** Rules that implement such a signal, or its objective. */
  signal_rules: string[];
  /** Every rule that uses it. */
  rules: string[];
}

export interface VisibilityUndeclared {
  system: string;
  name: string;
  rules: string[];
  /** Whether the system declares any log source (only then do query checks warn). */
  system_declares: boolean;
}

export interface VisibilityRead {
  rule: string;
  system: string;
  name: string;
  field_path: string;
}

export interface VisibilityExport {
  version: string;
  generatedAt: string | null;
  tlp: Tlp;
  present: boolean;
  problem: string | null;
  reads_unavailable: string | null;
  systems: Record<
    string,
    { logsources: number; with_columns: number; used: number }
  >;
  logsources: VisibilityLogSource[];
  undeclared: VisibilityUndeclared[];
  unknown_signal_sources: Array<{ name: string; objectives: string[] }>;
  reads: VisibilityRead[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The export as the view reads it, or null when the file is absent or not one this explorer
 * reads (another major version, or not an object). Missing keys read as empty.
 */
export function normalizeVisibility(raw: unknown): VisibilityExport | null {
  const data = record(raw);
  const version = text(data.version);
  if (!version || version.split(".")[0] !== "1") return null;
  const tlp = text(data.tlp).toLowerCase();
  const logsources = (Array.isArray(data.logsources) ? data.logsources : [])
    .map(record)
    .filter((source) => text(source.name) && text(source.system))
    .map((source) => {
      const read_by = strings(source.read_by);
      const signal_rules = strings(source.signal_rules);
      const rules = strings(source.rules);
      return {
        name: text(source.name),
        system: text(source.system),
        description: text(source.description),
        tenants: strings(source.tenants),
        columns: (Array.isArray(source.columns) ? source.columns : [])
          .map(record)
          .filter((column) => text(column.name))
          .map((column) => ({
            name: text(column.name),
            type: text(column.type),
            description: text(column.description),
          })),
        read_by,
        objectives: strings(source.objectives),
        signals: (Array.isArray(source.signals) ? source.signals : [])
          .map(record)
          .map((signal) => ({
            objective: text(signal.objective),
            uuid: text(signal.uuid),
            name: text(signal.name),
          })),
        signal_rules,
        rules: rules.length
          ? rules
          : [...new Set([...read_by, ...signal_rules])],
      };
    });
  const systems: VisibilityExport["systems"] = {};
  for (const [name, counts] of Object.entries(record(data.systems))) {
    const c = record(counts);
    systems[name] = {
      logsources: Number(c.logsources) || 0,
      with_columns: Number(c.with_columns) || 0,
      used: Number(c.used) || 0,
    };
  }
  return {
    version,
    generatedAt: text(data.generatedAt) || null,
    tlp: (TLP_VALUES as readonly string[]).includes(tlp)
      ? (tlp as Tlp)
      : "amber",
    present: data.present !== false,
    problem: text(data.problem) || null,
    reads_unavailable: text(data.reads_unavailable) || null,
    systems,
    logsources,
    undeclared: (Array.isArray(data.undeclared) ? data.undeclared : [])
      .map(record)
      .filter((item) => text(item.name))
      .map((item) => ({
        system: text(item.system),
        name: text(item.name),
        rules: strings(item.rules),
        system_declares: item.system_declares === true,
      })),
    unknown_signal_sources: (Array.isArray(data.unknown_signal_sources)
      ? data.unknown_signal_sources
      : []
    )
      .map(record)
      .map((item) => ({
        name: text(item.name),
        objectives: strings(item.objectives),
      })),
    reads: (Array.isArray(data.reads) ? data.reads : [])
      .map(record)
      .map((read) => ({
        rule: text(read.rule),
        system: text(read.system),
        name: text(read.name),
        field_path: text(read.field_path),
      })),
  };
}

/** A log source's identity in the view and the address: names are unique per system. */
export function logSourceKey(source: { system: string; name: string }): string {
  return `${source.system}:${source.name}`;
}

export function findLogSource(
  visibility: VisibilityExport,
  key: string,
): VisibilityLogSource | undefined {
  return visibility.logsources.find((source) => logSourceKey(source) === key);
}

export type LogSourceUse = "query" | "signal" | "objective";

/** The log sources an object uses, and how: a rule's query or signal, a signal, an objective. */
export function logSourcesFor(
  visibility: VisibilityExport | null,
  id: string,
): Array<{ source: VisibilityLogSource; how: LogSourceUse }> {
  if (!visibility) return [];
  const found: Array<{ source: VisibilityLogSource; how: LogSourceUse }> = [];
  for (const source of visibility.logsources) {
    if (source.read_by.includes(id)) found.push({ source, how: "query" });
    else if (
      source.signal_rules.includes(id) ||
      source.signals.some((signal) => signal.uuid === id)
    )
      found.push({ source, how: "signal" });
    else if (source.objectives.includes(id))
      found.push({ source, how: "objective" });
  }
  return found;
}

export interface VisibilityOverview {
  logsources: number;
  withColumns: number;
  used: number;
  withoutColumns: number;
  unused: number;
  undeclared: number;
  systems: Array<{
    name: string;
    logsources: number;
    withColumns: number;
    used: number;
  }>;
}

/** The tiles: log sources per system, how many declare columns, what needs attention. */
export function visibilityOverview(
  visibility: VisibilityExport,
): VisibilityOverview {
  const bySystem = new Map<
    string,
    { logsources: number; withColumns: number; used: number }
  >();
  for (const source of visibility.logsources) {
    const row = bySystem.get(source.system) ?? {
      logsources: 0,
      withColumns: 0,
      used: 0,
    };
    row.logsources += 1;
    if (source.columns.length) row.withColumns += 1;
    if (source.rules.length || source.objectives.length) row.used += 1;
    bySystem.set(source.system, row);
  }
  const systems = [...bySystem.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .toSorted(
      (a, b) => b.logsources - a.logsources || a.name.localeCompare(b.name),
    );
  const total = visibility.logsources.length;
  const withColumns = systems.reduce((sum, s) => sum + s.withColumns, 0);
  const used = systems.reduce((sum, s) => sum + s.used, 0);
  return {
    logsources: total,
    withColumns,
    used,
    withoutColumns: total - withColumns,
    unused: total - used,
    undeclared: visibility.undeclared.length,
    systems,
  };
}

/** Whether a log source answers a search: words match its name or description. */
export function matchesLogSource(
  source: { name: string; description?: string },
  query: string,
): boolean {
  const haystack = `${source.name} ${source.description ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
