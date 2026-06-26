export type ObjectType = "threat" | "objective" | "signal" | "rule";

export type ObjectBody = Record<string, unknown>;

export interface ModelsIndex {
  threat: Record<string, ObjectBody>;
  objective: Record<string, ObjectBody>;
  signal: Record<string, ObjectBody>;
  rule: Record<string, ObjectBody>;
}

export interface BundleObjectSummary {
  uuid: string;
  type: ObjectType;
  name: string;
  schema?: string;
  version?: number;
  tlp?: string;
  status?: string;
  techniques: string[];
  relatedCount: number;
  platforms: string[];
}

export interface ExplorerBundle {
  version: string;
  generatedAt: string;
  models: ModelsIndex;
  flatIndex: Record<string, ObjectBody>;
  chaining: Record<string, Record<string, string[]>>;
  signals: Record<string, ObjectBody>;
  summaries: BundleObjectSummary[];
}

export interface SearchDocument {
  id: string;
  type: ObjectType;
  name: string;
  uuid: string;
  techniques: string[];
  platforms: string[];
  status?: string;
  content: string;
}

export interface ExplorerSearchIndex {
  documents: SearchDocument[];
}

export interface CoverageGap {
  kind: "signal-no-rules" | "technique-gap" | "mdr-only" | "partial-data";
  objectId: string;
  objectName: string;
  detail: string;
}

export interface ExplorerCoverage {
  gaps: CoverageGap[];
  techniqueMatrix: Record<
    string,
    { color: string; comment?: string; objects: string[] }
  >;
  platformRollup: Record<string, { total: number; covered: number }>;
}

export interface AttackNavigatorLayer {
  versions?: { layer?: string };
  techniques: Array<{
    techniqueID: string;
    color: string;
    comment?: string;
    enabled?: boolean;
  }>;
}

export const TYPE_COLORS: Record<ObjectType, string> = {
  threat: "#ef4444",
  objective: "#c9a000",
  signal: "#f59e0b",
  rule: "#22c55e",
};

export const DEPRECATED_STATUSES = new Set([
  "deprecated",
  "retired",
  "decommissioned",
]);
