import { UUID_RE } from "@/lib/opentide/uuid";
import type { CatalogFilters, ClauseSet } from "@/lib/search/filters";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  ObjectBody,
  ObjectType,
  SearchDocument,
  StagingIndex,
} from "@/lib/opentide/types";

/**
 * Catalogue search. A corpus of a few hundred objects searches in well under a millisecond
 * with plain substring matching over prepared haystacks, so this runs synchronously on every
 * keystroke: no index build, no async round trip, and identical results everywhere.
 */

const TECHNIQUE_RE = /^T\d{4}(\.\d{3})?$/i;
const CONTENT_LIMIT = 6000;

const TYPE_RANK: Record<ObjectType, number> = {
  threat: 0,
  objective: 1,
  signal: 2,
  rule: 3,
};

/** Every string value in an object body, keys left out, joined for substring search. */
function bodyText(body: ObjectBody | undefined): string {
  if (!body) return "";
  const parts: string[] = [];
  let length = 0;
  const walk = (value: unknown) => {
    if (length > CONTENT_LIMIT) return;
    if (typeof value === "string") {
      parts.push(value);
      length += value.length + 1;
    } else if (typeof value === "number") {
      parts.push(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) walk(item);
    }
  };
  walk(body);
  return parts.join(" ").slice(0, CONTENT_LIMIT);
}

/**
 * Search documents straight from the bundle: one per object, its text drawn from its body.
 * `techniquesOf` decides what `technique:` matches; the catalogue passes the resolution the
 * ATT&CK matrix uses, so a cell's filter finds the objects the cell counts.
 */
export function buildSearchDocuments(
  bundle: ExplorerBundle,
  techniquesOf: (summary: BundleObjectSummary) => string[] = (summary) =>
    summary.techniques,
): SearchDocument[] {
  return bundle.summaries.map((summary: BundleObjectSummary) => ({
    id: summary.uuid,
    uuid: summary.uuid,
    type: summary.type,
    name: summary.name,
    techniques: techniquesOf(summary),
    actors: summary.actors,
    platforms: summary.platforms,
    schema: summary.schema ?? "",
    tlp: summary.tlp ?? "",
    status: summary.status ?? "",
    relatedCount: summary.relatedCount,
    content: bodyText(bundle.flatIndex[summary.uuid]),
  }));
}

interface IndexedDocument {
  doc: SearchDocument;
  name: string;
  /** Name plus uuid, techniques, actors, platforms and body text, lowercased. */
  hay: string;
  techniques: string[];
  actors: string[];
}

export interface SearchIndex {
  entries: IndexedDocument[];
  byId: Map<string, SearchDocument>;
}

export function createSearchIndex(documents: SearchDocument[]): SearchIndex {
  const entries = documents.map((doc) => {
    const name = doc.name.toLowerCase();
    const techniques = (doc.techniques ?? []).map((t) => t.toUpperCase());
    const actors = (doc.actors ?? []).map((a) => a.toLowerCase());
    return {
      doc,
      name,
      techniques,
      actors,
      hay: [
        name,
        doc.uuid.toLowerCase(),
        techniques.join(" ").toLowerCase(),
        actors.join(" "),
        (doc.platforms ?? []).join(" ").toLowerCase(),
        doc.content.toLowerCase(),
      ].join("\n"),
    };
  });
  return { entries, byId: new Map(documents.map((doc) => [doc.uuid, doc])) };
}

function includesTechnique(techniques: string[], wanted: string): boolean {
  const id = wanted.toUpperCase();
  return techniques.some((t) => t === id || t.startsWith(`${id}.`));
}

type DeploySets = { staging?: Set<string>; production?: Set<string> };

/** Whether an object has one clause value, per field; `:` needs one, `!=` needs none. */
const HAS_VALUE = {
  types: (entry: IndexedDocument, type: string) => entry.doc.type === type,
  uuids: (entry: IndexedDocument, uuid: string) =>
    entry.doc.uuid.toLowerCase() === uuid.toLowerCase(),
  platforms: (entry: IndexedDocument, platform: string) =>
    entry.doc.platforms.some((p) =>
      p.toLowerCase().includes(platform.toLowerCase()),
    ),
  statuses: (entry: IndexedDocument, status: string) =>
    (entry.doc.status ?? "").toUpperCase().includes(status.toUpperCase()),
  techniques: (entry: IndexedDocument, technique: string) =>
    includesTechnique(entry.techniques, technique),
  actors: (entry: IndexedDocument, actor: string) =>
    entry.actors.some((a) => a.includes(actor.toLowerCase())),
  schemas: (entry: IndexedDocument, schema: string) =>
    (entry.doc.schema ?? "").toLowerCase().includes(schema.toLowerCase()),
  tlps: (entry: IndexedDocument, tlp: string) =>
    (entry.doc.tlp ?? "").toUpperCase().includes(tlp.toUpperCase()),
} satisfies Record<string, (entry: IndexedDocument, value: string) => boolean>;

type ValueField = keyof typeof HAS_VALUE;

/** The structured part of a clause set as one test, built once per search. */
function filterPredicate(
  filters: ClauseSet,
  deploy: DeploySets,
): (entry: IndexedDocument) => boolean {
  const wanted: Record<ValueField, string[]> = {
    types: filters.types,
    uuids: filters.uuids,
    platforms: filters.platforms,
    statuses: filters.statuses,
    techniques: filters.techniques,
    actors: filters.actors,
    schemas: filters.schemas,
    tlps: filters.tlps,
  };
  const fields = (Object.keys(HAS_VALUE) as ValueField[]).filter(
    (field) => wanted[field].length || filters.exclude[field].length,
  );

  return (entry) => {
    const { uuid } = entry.doc;
    for (const field of fields) {
      const has = HAS_VALUE[field];
      const values = wanted[field];
      if (values.length && !values.some((value) => has(entry, value))) {
        return false;
      }
      if (filters.exclude[field].some((value) => has(entry, value))) {
        return false;
      }
    }

    if (filters.stagingOnly && deploy.staging && !deploy.staging.has(uuid)) {
      return false;
    }
    if (
      filters.productionOnly &&
      deploy.production &&
      !deploy.production.has(uuid)
    ) {
      return false;
    }
    for (const target of filters.exclude.deploy) {
      if (deploy[target]?.has(uuid)) return false;
    }
    return true;
  };
}

/** How well one term matches; 0 means it does not. */
function termScore(entry: IndexedDocument, term: string): number {
  const { name } = entry;
  if (name === term) return 120;
  if (name.startsWith(term)) return 80;
  const at = name.indexOf(term);
  if (at > 0) return /[\s\-_:/([]/.test(name[at - 1]!) ? 55 : 35;
  if (TECHNIQUE_RE.test(term) && includesTechnique(entry.techniques, term)) {
    return 45;
  }
  if (entry.actors.some((actor) => actor.includes(term))) return 30;
  return entry.hay.includes(term) ? 8 : 0;
}

const deploySets = new WeakMap<
  StagingIndex,
  { staging: Set<string>; production: Set<string> }
>();

function deployFor(stagingIndex: StagingIndex | undefined) {
  if (!stagingIndex) return {};
  let sets = deploySets.get(stagingIndex);
  if (!sets) {
    sets = {
      staging: new Set(stagingIndex.stagingObjects),
      production: new Set(stagingIndex.productionObjects),
    };
    deploySets.set(stagingIndex, sets);
  }
  return sets;
}

/**
 * The words of free text, lowercased; a quoted run is one phrase, matched whole. A quote left
 * open while typing still makes a phrase of what follows it.
 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const [, phrase, word] of query.matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
    const term = (phrase ?? word ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (term) terms.push(term);
  }
  return terms;
}

/** A clause set ready to test: its filters as one predicate, its free text as terms. */
interface CompiledSet {
  matches: (entry: IndexedDocument) => boolean;
  terms: string[];
}

/** Every term must match somewhere, and the name counts most; 0 when one does not. */
function textScore(entry: IndexedDocument, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    const s = termScore(entry, term);
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

/** How well an object matches a group: every part must, so 0 when one does not. */
function groupScore(entry: IndexedDocument, parts: CompiledSet[]): number {
  let score = 0;
  for (const part of parts) {
    if (!part.matches(entry)) return 0;
    if (!part.terms.length) {
      score += 1;
      continue;
    }
    const s = textScore(entry, part.terms);
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

export function searchCatalog(
  index: SearchIndex,
  filters: CatalogFilters,
  options?: { stagingIndex?: StagingIndex; limit?: number },
): SearchDocument[] {
  const limit = options?.limit ?? 500;
  const deploy = deployFor(options?.stagingIndex);
  const compile = (set: ClauseSet): CompiledSet => ({
    matches: filterPredicate(set, deploy),
    terms: searchTerms(set.query),
  });

  if (!filters.groups.length) {
    const term = filters.query.trim().toLowerCase();
    if (UUID_RE.test(term)) {
      const matches = filterPredicate(filters, deploy);
      const doc = index.byId.get(term);
      const entry = doc && index.entries.find((e) => e.doc === doc);
      return entry && matches(entry) ? [entry.doc] : [];
    }
  }

  // Any group may match; the best one decides how well.
  const groups = (filters.groups.length ? filters.groups : [[filters]]).map(
    (group) => group.map(compile),
  );
  const ranked = groups.some((group) =>
    group.some((part) => part.terms.length),
  );
  const scored: Array<{ entry: IndexedDocument; score: number }> = [];
  for (const entry of index.entries) {
    let score = 0;
    for (const group of groups)
      score = Math.max(score, groupScore(entry, group));
    if (score > 0) scored.push({ entry, score });
  }
  if (!ranked) return scored.slice(0, limit).map(({ entry }) => entry.doc);

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      TYPE_RANK[a.entry.doc.type] - TYPE_RANK[b.entry.doc.type] ||
      a.entry.name.localeCompare(b.entry.name),
  );
  return scored.slice(0, limit).map(({ entry }) => entry.doc);
}

/** Distinct filterable values across the corpus, for autocomplete and facets. */
export function collectFilterOptions(
  bundle: Pick<ExplorerBundle, "summaries">,
) {
  const types = new Set<string>();
  const platforms = new Set<string>();
  const statuses = new Set<string>();
  const techniques = new Set<string>();
  const actors = new Set<string>();

  for (const summary of bundle.summaries) {
    types.add(summary.type);
    for (const platform of summary.platforms ?? []) platforms.add(platform);
    if (summary.status) statuses.add(summary.status);
    for (const technique of summary.techniques ?? []) techniques.add(technique);
    for (const actor of summary.actors ?? []) actors.add(actor);
  }

  return {
    types: [...types].toSorted() as ObjectType[],
    platforms: [...platforms].toSorted(),
    statuses: [...statuses].toSorted(),
    techniques: [...techniques].toSorted(),
    actors: [...actors].toSorted(),
  };
}
