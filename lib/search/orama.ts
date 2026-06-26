import { create, insert, search as oramaSearch } from "@orama/orama";
import type { SearchDocument } from "@/lib/opentide/types";

export interface SearchSchema {
  id: string;
  name: string;
  uuid: string;
  type: string;
  techniques: string[];
  platforms: string[];
  status: string;
  content: string;
}

export async function buildOramaIndex(documents: SearchDocument[]) {
  const db = await create({
    schema: {
      id: "string",
      name: "string",
      uuid: "string",
      type: "string",
      techniques: "string[]",
      platforms: "string[]",
      status: "string",
      content: "string",
    } as const,
  });

  for (const doc of documents) {
    await insert(db, {
      id: doc.id,
      name: doc.name,
      uuid: doc.uuid,
      type: doc.type,
      techniques: doc.techniques,
      platforms: doc.platforms,
      status: doc.status ?? "",
      content: doc.content,
    });
  }

  return db;
}

export async function searchCatalog(
  db: Awaited<ReturnType<typeof buildOramaIndex>>,
  term: string,
  limit = 20,
) {
  if (!term.trim()) return [];

  const lower = term.toLowerCase();

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)
  ) {
    const byUuid = await oramaSearch(db, {
      term: term,
      properties: ["uuid"],
      limit,
    });
    if (byUuid.hits.length > 0) return byUuid.hits;
  }

  if (/^T\d{4}(\.\d{3})?$/i.test(term)) {
    const byTech = await oramaSearch(db, {
      term: term.toUpperCase(),
      properties: ["techniques"],
      limit,
    });
    if (byTech.hits.length > 0) return byTech.hits;
  }

  const typeMatch = term.match(/type:(\w+)/i);
  const platformMatch = term.match(/platform:(\w+)/i);
  const statusMatch = term.match(/status:(\w+)/i);

  let searchTerm = term
    .replace(/type:\w+/gi, "")
    .replace(/platform:\w+/gi, "")
    .replace(/status:\w+/gi, "")
    .trim();

  const results = await oramaSearch(db, {
    term: searchTerm || "*",
    properties: ["name", "content", "uuid"],
    limit: limit * 2,
  });

  return results.hits
    .filter((hit) => {
      const doc = hit.document as SearchDocument;
      if (typeMatch && doc.type !== typeMatch[1]!.toLowerCase()) return false;
      if (
        platformMatch &&
        !doc.platforms.some((p) =>
          p.toLowerCase().includes(platformMatch[1]!.toLowerCase()),
        )
      )
        return false;
      if (
        statusMatch &&
        !(doc.status ?? "")
          .toLowerCase()
          .includes(statusMatch[1]!.toLowerCase())
      )
        return false;
      if (!searchTerm) return true;
      return (
        doc.name.toLowerCase().includes(lower) ||
        doc.content.toLowerCase().includes(lower) ||
        doc.uuid.toLowerCase().includes(lower)
      );
    })
    .slice(0, limit);
}
