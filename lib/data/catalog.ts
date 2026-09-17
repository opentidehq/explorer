import type { ExplorerBundle, ExplorerSearchIndex } from "@/lib/opentide/types";
import type { VocabIndex } from "@/lib/opentide/vocab";

export function catalogDataUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}/data/${filename}`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Older bundles omit `actors` / `platforms` on summaries. */
export function normalizeExplorerBundle(
  bundle: ExplorerBundle,
): ExplorerBundle {
  return {
    ...bundle,
    summaries: bundle.summaries.map((summary) => ({
      ...summary,
      techniques: asStringArray(summary.techniques),
      actors: asStringArray(summary.actors),
      platforms: asStringArray(summary.platforms),
    })),
  };
}

export function normalizeSearchIndex(
  search: ExplorerSearchIndex,
): ExplorerSearchIndex {
  return {
    documents: search.documents.map((doc) => ({
      ...doc,
      techniques: asStringArray(doc.techniques),
      actors: asStringArray(doc.actors),
      platforms: asStringArray(doc.platforms),
    })),
  };
}

export interface CatalogPayload {
  bundle: ExplorerBundle;
  search: ExplorerSearchIndex;
  vocabIndex: VocabIndex;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Load catalogue JSON once from `/data`. Pages must not inline these files. */
export async function loadCatalog(): Promise<CatalogPayload> {
  const [bundle, search, vocabIndex] = await Promise.all([
    fetchJson<ExplorerBundle>(catalogDataUrl("explorer.bundle.json")),
    fetchJson<ExplorerSearchIndex>(catalogDataUrl("explorer.search.json")),
    fetchJson<VocabIndex>(catalogDataUrl("vocab.index.json")),
  ]);

  if (!bundle) {
    throw new Error("Catalogue bundle is unavailable");
  }

  return {
    bundle: normalizeExplorerBundle(bundle),
    search: normalizeSearchIndex(search ?? { documents: [] }),
    vocabIndex: vocabIndex ?? {},
  };
}
