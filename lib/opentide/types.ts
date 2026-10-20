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
  actors: string[];
  relatedCount: number;
  platforms: string[];
  /** Corpus-relative file path (`objects/threats/….yaml`); embedded signals carry their objective's. */
  path?: string;
}

/** Where the corpus lives, so objects can link to their file. */
export interface BundleSource {
  /** Repository web URL, e.g. `https://github.com/opentidehq/library`. */
  repository: string;
  /** Commit or branch the bundle was generated from. */
  ref: string;
}

export interface StagingPlatformSummary {
  production: number;
  staging: number;
  other: number;
}

export interface StagingIndex {
  /** uuid → platform → deployment status */
  deployments: Record<string, Record<string, string>>;
  /** platform → rollout counts */
  platformSummary: Record<string, StagingPlatformSummary>;
  /** uuids with any STAGING platform deployment */
  stagingObjects: string[];
  /** uuids with any PRODUCTION platform deployment */
  productionObjects: string[];
}

export interface ExplorerBundle {
  version: string;
  generatedAt: string;
  models: ModelsIndex;
  flatIndex: Record<string, ObjectBody>;
  chaining: Record<string, Record<string, string[]>>;
  signals: Record<string, ObjectBody>;
  summaries: BundleObjectSummary[];
  stagingIndex?: StagingIndex;
  source?: BundleSource;
}

/**
 * A bundle as served. Since 0.2 the generator ships each object once, in `flatIndex`;
 * `models` and `signals` are rebuilt on load (see normalizeExplorerBundle).
 */
export type RawExplorerBundle = Omit<ExplorerBundle, "models" | "signals"> & {
  models?: Partial<ModelsIndex>;
  signals?: Record<string, ObjectBody>;
};

export interface SearchDocument {
  id: string;
  type: ObjectType;
  name: string;
  uuid: string;
  techniques: string[];
  actors: string[];
  platforms: string[];
  schema?: string;
  tlp?: string;
  status?: string;
  content: string;
  relatedCount: number;
}

export interface ExplorerSearchIndex {
  documents: SearchDocument[];
}

export const OBJECT_TYPES: readonly ObjectType[] = [
  "threat",
  "objective",
  "signal",
  "rule",
];
