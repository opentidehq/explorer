import { create, insert, search as oramaSearch } from "@orama/orama";
import type { CatalogFilters } from "@/lib/search/filters";
import type {
  ExplorerBundle,
  SearchDocument,
  StagingIndex,
} from "@/lib/opentide/types";

export interface SearchSchema {
  id: string;
  name: string;
  uuid: string;
  type: string;
  techniques: string[];
  actors: string[];
  platforms: string[];
  status: string;
  content: string;
  relatedCount: number;
}

export async function buildOramaIndex(documents: SearchDocument[]) {
  const db = await create({
    schema: {
      id: "string",
      name: "string",
      uuid: "string",
      type: "string",
      techniques: "string[]",
      actors: "string[]",
      platforms: "string[]",
      schema: "string",
      tlp: "string",
      status: "string",
      content: "string",
      relatedCount: "number",
    } as const,
  });

  for (const doc of documents) {
    await insert(db, {
      id: doc.id,
      name: doc.name,
      uuid: doc.uuid,
      type: doc.type,
      techniques: doc.techniques,
      actors: doc.actors,
      platforms: doc.platforms,
      schema: doc.schema ?? "",
      tlp: doc.tlp ?? "",
      status: doc.status ?? "",
      content: doc.content,
      relatedCount: doc.relatedCount,
    });
  }

  return db;
}

function matchesDocument(
  doc: SearchDocument,
  filters: CatalogFilters,
  stagingIndex?: StagingIndex,
): boolean {
  if (filters.types.length && !filters.types.includes(doc.type)) return false;

  if (filters.uuid && doc.uuid.toLowerCase() !== filters.uuid.toLowerCase()) {
    return false;
  }

  if (
    filters.platforms.length &&
    !filters.platforms.some((p) =>
      doc.platforms.some((dp) => dp.toLowerCase().includes(p.toLowerCase())),
    )
  ) {
    return false;
  }

  if (
    filters.statuses.length &&
    !filters.statuses.some((s) =>
      (doc.status ?? "").toUpperCase().includes(s.toUpperCase()),
    )
  ) {
    return false;
  }

  if (
    filters.techniques.length &&
    !filters.techniques.some((t) =>
      doc.techniques.some((dt) => dt.toUpperCase() === t.toUpperCase()),
    )
  ) {
    return false;
  }

  if (
    filters.actors.length &&
    !filters.actors.some((a) =>
      doc.actors.some((da) => da.toLowerCase().includes(a.toLowerCase())),
    )
  ) {
    return false;
  }

  if (
    filters.schemas.length &&
    !filters.schemas.some((s) =>
      (doc.schema ?? "").toLowerCase().includes(s.toLowerCase()),
    )
  ) {
    return false;
  }

  if (
    filters.tlps.length &&
    !filters.tlps.some((t) =>
      (doc.tlp ?? "").toUpperCase().includes(t.toUpperCase()),
    )
  ) {
    return false;
  }

  if (filters.stagingOnly && stagingIndex) {
    if (!stagingIndex.stagingObjects.includes(doc.uuid)) return false;
  }

  if (filters.productionOnly && stagingIndex) {
    if (!stagingIndex.productionObjects.includes(doc.uuid)) return false;
  }

  return true;
}

export async function searchCatalog(
  db: Awaited<ReturnType<typeof buildOramaIndex>>,
  filters: CatalogFilters,
  options?: {
    stagingIndex?: StagingIndex;
    limit?: number;
    documents?: SearchDocument[];
  },
): Promise<SearchDocument[]> {
  const limit = options?.limit ?? 500;
  const stagingIndex = options?.stagingIndex;
  const term = filters.query.trim();

  if (
    filters.uuid &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      filters.uuid,
    )
  ) {
    const byUuid = await oramaSearch(db, {
      term: filters.uuid,
      properties: ["uuid"],
      limit: 1,
    });
    return byUuid.hits
      .map((h) => h.document as SearchDocument)
      .filter((doc) => matchesDocument(doc, filters, stagingIndex));
  }

  if (
    term &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)
  ) {
    const byUuid = await oramaSearch(db, {
      term,
      properties: ["uuid"],
      limit: 1,
    });
    return byUuid.hits
      .map((h) => h.document as SearchDocument)
      .filter((doc) => matchesDocument(doc, filters, stagingIndex));
  }

  if (term && /^T\d{4}(\.\d{3})?$/i.test(term)) {
    const byTech = await oramaSearch(db, {
      term: term.toUpperCase(),
      properties: ["techniques"],
      limit,
    });
    return byTech.hits
      .map((h) => h.document as SearchDocument)
      .filter((doc) => matchesDocument(doc, filters, stagingIndex));
  }

  if (!term && options?.documents) {
    return options.documents
      .filter((doc) => matchesDocument(doc, filters, stagingIndex))
      .slice(0, limit);
  }

  const results = await oramaSearch(db, {
    term,
    properties: ["name", "content", "uuid", "actors", "techniques"],
    limit: limit * 3,
  });

  return results.hits
    .map((h) => h.document as SearchDocument)
    .filter((doc) => {
      if (!matchesDocument(doc, filters, stagingIndex)) return false;
      if (!term) return true;
      const lower = term.toLowerCase();
      return (
        doc.name.toLowerCase().includes(lower) ||
        doc.content.toLowerCase().includes(lower) ||
        doc.uuid.toLowerCase().includes(lower) ||
        doc.actors.some((a) => a.toLowerCase().includes(lower)) ||
        doc.techniques.some((t) => t.toLowerCase().includes(lower))
      );
    })
    .slice(0, limit);
}

export function collectFilterOptions(bundle: ExplorerBundle) {
  const types = new Set<string>();
  const platforms = new Set<string>();
  const statuses = new Set<string>();
  const techniques = new Set<string>();
  const actors = new Set<string>();

  for (const summary of bundle.summaries) {
    types.add(summary.type);
    summary.platforms.forEach((p) => platforms.add(p));
    if (summary.status) statuses.add(summary.status);
    summary.techniques.forEach((t) => techniques.add(t));
    summary.actors.forEach((a) => actors.add(a));
  }

  return {
    types: [...types].sort() as Array<
      "threat" | "objective" | "signal" | "rule"
    >,
    platforms: [...platforms].sort(),
    statuses: [...statuses].sort(),
    techniques: [...techniques].sort(),
    actors: [...actors].sort(),
  };
}
