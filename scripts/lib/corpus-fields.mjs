/**
 * Shared extraction helpers for explorer mock-bundle summaries.
 */

/**
 * @param {unknown} actor
 * @returns {string}
 */
export function actorRefName(actor) {
  if (typeof actor === "string") return actor.trim();
  if (actor && typeof actor === "object") {
    const record = /** @type {Record<string, unknown>} */ (actor);
    for (const key of ["name", "id", "value"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return "";
}

/**
 * @param {unknown} actors
 * @returns {string[]}
 */
export function collectActorNames(actors) {
  const names = [];
  const seen = new Set();
  if (!Array.isArray(actors)) return names;
  for (const actor of actors) {
    const name = actorRefName(actor);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * First non-empty string array among candidates.
 * @param {...unknown} candidates
 * @returns {string[]}
 */
export function techniqueList(...candidates) {
  for (const value of candidates) {
    if (!Array.isArray(value) || value.length === 0) continue;
    return value.filter((item) => typeof item === "string");
  }
  return [];
}
