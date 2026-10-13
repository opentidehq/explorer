import type {
  BundleObjectSummary,
  ExplorerBundle,
  ModelsIndex,
  ObjectBody,
  ObjectType,
  RawExplorerBundle,
} from "@/lib/opentide/types";
import {
  expandSlimVocab,
  isSlimVocab,
  type VocabIndex,
} from "@/lib/opentide/vocab";

export function catalogDataUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}/data/${filename}`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

const TYPES: ObjectType[] = ["threat", "objective", "signal", "rule"];

/** Rebuild the per-type model index from `flatIndex` and the summaries' types. */
function modelsFromSummaries(
  flatIndex: Record<string, ObjectBody>,
  summaries: BundleObjectSummary[],
): ModelsIndex {
  const models: ModelsIndex = {
    threat: {},
    objective: {},
    signal: {},
    rule: {},
  };
  for (const summary of summaries) {
    const body = flatIndex[summary.uuid];
    if (body && TYPES.includes(summary.type)) {
      models[summary.type][summary.uuid] = body;
    }
  }
  return models;
}

/**
 * Accept both bundle layouts: 0.1 ships `models` and `signals` beside `flatIndex`, 0.2 ships
 * `flatIndex` alone. Older bundles also omit `actors` / `platforms` on summaries.
 */
export function normalizeExplorerBundle(
  bundle: RawExplorerBundle | ExplorerBundle,
): ExplorerBundle {
  const flatIndex = bundle.flatIndex ?? {};
  const summaries = (bundle.summaries ?? []).map((summary) => ({
    ...summary,
    techniques: asStringArray(summary.techniques),
    actors: asStringArray(summary.actors),
    platforms: asStringArray(summary.platforms),
  }));

  const raw = bundle.models;
  const models: ModelsIndex =
    raw && TYPES.every((type) => raw[type])
      ? (raw as ModelsIndex)
      : modelsFromSummaries(flatIndex, summaries);

  return {
    ...bundle,
    flatIndex,
    chaining: bundle.chaining ?? {},
    summaries,
    models,
    signals: bundle.signals ?? { ...models.signal },
  };
}

export interface CatalogPayload {
  bundle: ExplorerBundle;
  vocabIndex: VocabIndex;
}

export type CatalogStage = "fetching" | "indexing";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The slim vocabulary when the build wrote one; the full index otherwise (bundles from
 * `opentide generate explorer`, local dev before codegen).
 */
async function loadVocab(): Promise<VocabIndex> {
  const slim = await fetchJson<unknown>(catalogDataUrl("explorer.vocab.json"));
  if (isSlimVocab(slim)) return expandSlimVocab(slim);
  return (
    (await fetchJson<VocabIndex>(catalogDataUrl("vocab.index.json"))) ?? {}
  );
}

/** Load catalogue JSON once from `/data`. Pages must not inline these files. */
export async function loadCatalog(
  onStage?: (stage: CatalogStage) => void,
): Promise<CatalogPayload> {
  onStage?.("fetching");
  const [bundle, vocabIndex] = await Promise.all([
    fetchJson<RawExplorerBundle>(catalogDataUrl("explorer.bundle.json")),
    loadVocab(),
  ]);

  if (!bundle) {
    throw new Error("Catalogue bundle is unavailable");
  }

  onStage?.("indexing");
  return {
    bundle: normalizeExplorerBundle(bundle),
    vocabIndex,
  };
}
