import type { ExplorerBundle, ExplorerSearchIndex } from "@/lib/opentide/types";
import type { VocabIndex } from "@/lib/opentide/vocab";

export function catalogDataUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}/data/${filename}`;
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
    bundle,
    search: search ?? { documents: [] },
    vocabIndex: vocabIndex ?? {},
  };
}
