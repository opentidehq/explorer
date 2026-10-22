/**
 * Compact vocabulary export for the explorer client (`explorer.vocab.json`).
 *
 * `vocab.index.json` repeats every term, description included, under each of its alias keys,
 * and ships every actor, group and malware term in the specifications: about 15 MB. The client
 * needs every ATT&CK technique (the matrix lists them all) and the small vocabularies whole,
 * but of the large catalogues only the terms the corpus names. Each term is stored once and
 * keys point at it by index.
 */

export const SLIM_VOCAB_VERSION = 1;

/** Buckets with more distinct terms than this keep only the terms the corpus references. */
const LARGE_BUCKET_TERMS = 100;

/** Buckets the explorer reads whole: the matrix, surface matching in prose, layouts. */
const KEEP_WHOLE = new Set([
  "att&ck",
  "surface",
  "killchain",
  "chaining_relations",
]);

const DESCRIPTION_LIMIT = 600;
/** Technique descriptions only feed tooltips and the inspector; MITRE links the rest. */
const ATTACK_DESCRIPTION_LIMIT = 320;

const CITATION_RE = /\s*\(Citation:[^)]*\)/g;

/**
 * Trim prose to whole sentences under `limit` characters, never inside a markdown link.
 * @param {string | undefined} text
 * @param {number} limit
 * @returns {string | undefined}
 */
export function trimDescription(text, limit) {
  if (typeof text !== "string") return undefined;
  const clean = text.replace(CITATION_RE, "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (clean.length <= limit) return clean;

  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > limit) break;
    out = next;
  }

  if (!out) {
    const cut = clean.slice(0, limit);
    const space = cut.lastIndexOf(" ");
    out = space > limit * 0.6 ? cut.slice(0, space) : cut;
    // A cut inside `[label](url)` would leave broken markdown: drop the partial link.
    const open = out.lastIndexOf("[");
    if (open !== -1 && !/\]\([^)]*\)/.test(out.slice(open))) {
      out = out.slice(0, open).trimEnd();
    }
    out = `${out.replace(/[,;:\s]+$/, "")}…`;
  }

  return out;
}

/**
 * Every string the corpus holds, lowercased: leaves of every object, and pill lists split on
 * `;` and `,` the way the client splits them.
 * @param {Iterable<unknown>} objects
 * @returns {Set<string>}
 */
export function collectCorpusValues(objects) {
  /** @type {Set<string>} */
  const values = new Set();

  /** @param {string} text */
  const add = (text) => {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed || trimmed.length > 200) return;
    values.add(trimmed);
    for (const part of trimmed.split(/[;,]/)) {
      const piece = part.trim();
      if (piece) values.add(piece);
    }
  };

  /** @param {unknown} value */
  const walk = (value) => {
    if (typeof value === "string") {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) walk(item);
    }
  };

  for (const object of objects) walk(object);
  return values;
}

/**
 * The lowercase strings `lookupVocabTerm` would match a term on.
 * @param {string[]} keys
 * @param {{ name: string, aliases?: string[] }} term
 */
function termHandles(keys, term) {
  const handles = new Set(keys.map((key) => key.trim().toLowerCase()));
  const name = term.name.toLowerCase();
  handles.add(name);
  const leaf = term.name.split("::").pop();
  if (leaf) handles.add(leaf.toLowerCase());
  for (const alias of term.aliases ?? []) handles.add(alias.toLowerCase());
  return handles;
}

/**
 * @param {Record<string, Record<string, Record<string, unknown>>>} index Full vocab index.
 * @param {Set<string>} corpusValues From `collectCorpusValues`.
 */
export function slimVocabIndex(index, corpusValues) {
  /** @type {Record<string, { terms: Record<string, unknown>[], keys: Record<string, number> }>} */
  const vocabs = {};

  for (const [bucket, entries] of Object.entries(index).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    // vocab.index.json repeats a term per key; equal serialisations are one term.
    /** @type {Map<string, { term: Record<string, unknown>, keys: string[] }>} */
    const groups = new Map();
    for (const [key, term] of Object.entries(entries)) {
      if (!term || typeof term !== "object") continue;
      const id = JSON.stringify(term);
      const group = groups.get(id);
      if (group) group.keys.push(key);
      else groups.set(id, { term, keys: [key] });
    }

    const trimAll = !KEEP_WHOLE.has(bucket) && groups.size > LARGE_BUCKET_TERMS;
    const limit =
      bucket === "att&ck" ? ATTACK_DESCRIPTION_LIMIT : DESCRIPTION_LIMIT;

    /** @type {Record<string, unknown>[]} */
    const terms = [];
    /** @type {Record<string, number>} */
    const keys = {};

    for (const { term, keys: termKeys } of groups.values()) {
      const name = typeof term.name === "string" ? term.name : "";
      if (!name) continue;
      const aliases = Array.isArray(term.aliases)
        ? term.aliases.filter((alias) => typeof alias === "string")
        : undefined;

      if (trimAll) {
        const handles = termHandles(termKeys, { name, aliases });
        let referenced = false;
        for (const handle of handles) {
          if (corpusValues.has(handle)) {
            referenced = true;
            break;
          }
        }
        if (!referenced) continue;
      }

      const description = trimDescription(
        typeof term.description === "string" ? term.description : undefined,
        limit,
      );
      const stages = Array.isArray(term.stages)
        ? term.stages.filter((stage) => typeof stage === "string")
        : undefined;

      /** @type {Record<string, unknown>} */
      const slim = { name };
      if (description) slim.description = description;
      if (typeof term.stage === "string") slim.stage = term.stage;
      if (stages?.length) slim.stages = stages;
      if (aliases?.length) slim.aliases = aliases;
      if (typeof term.link === "string") slim.link = term.link;

      const position = terms.push(slim) - 1;
      for (const key of termKeys) {
        // `Tactic::T1548` keys only repeat what `stages` says.
        if (
          bucket === "att&ck" &&
          stages?.some((stage) => key.startsWith(`${stage}::`))
        ) {
          continue;
        }
        keys[key] = position;
      }
    }

    if (terms.length) vocabs[bucket] = { terms, keys };
  }

  return { version: SLIM_VOCAB_VERSION, vocabs };
}
