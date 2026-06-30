export interface VocabTerm {
  name: string;
  description?: string;
  /** Primary tactic / compound vocab bucket (e.g. att&ck, misp). */
  stage?: string;
  /** ATT&CK tactic names when a technique spans multiple tactics. */
  stages?: string[];
  aliases?: string[];
  link?: string;
}

export type VocabIndex = Record<string, Record<string, VocabTerm>>;

export function lookupVocabTerm(
  index: VocabIndex,
  vocab: string,
  value: string,
): VocabTerm | undefined {
  const bucket = index[vocab];
  if (!bucket) return undefined;
  const trimmed = value.trim();
  const direct = bucket[value] ?? bucket[trimmed];
  if (direct) return direct;

  const lower = trimmed.toLowerCase();
  for (const [key, term] of Object.entries(bucket)) {
    if (key.toLowerCase() === lower) return term;
    if (term.name.toLowerCase() === lower) return term;
    const leaf = term.name.split("::").pop();
    if (leaf?.toLowerCase() === lower) return term;
    if (term.aliases?.some((alias) => alias.toLowerCase() === lower)) {
      return term;
    }
  }

  return undefined;
}

/** Strip ATT&CK matrix prefixes for compact pill labels. */
export function formatVocabDisplayName(name: string): string {
  return name
    .replace(/^\[(Enterprise|ICS|Mobile)\]\s+/, "")
    .replace(/^(Industrial|Mobile|Enterprise)\s*:\s+/, "");
}

export function formatActorFallbackLabel(value: string): string {
  const trimmed = value.trim();
  const sep = trimmed.indexOf("::");
  if (sep === -1) return trimmed;
  const id = trimmed.slice(sep + 2);
  if (/^G\d{4}$/i.test(id)) return id.toUpperCase();
  if (/^[0-9a-f-]{36}$/i.test(id)) return `${id.slice(0, 8)}…`;
  return id;
}

/** Resolve `support::enabled` style chaining relation keys */
export function lookupChainingRelation(
  index: VocabIndex,
  relation: string,
): VocabTerm | undefined {
  const bucket = index["chaining_relations"];
  if (!bucket) return undefined;
  const short = relation.includes("::")
    ? relation.split("::").pop()!
    : relation;
  return bucket[relation] ?? bucket[short];
}

export function splitPillValues(value: unknown): string[] {
  let raw: string[];
  if (Array.isArray(value)) raw = value.map(String).filter(Boolean);
  else if (typeof value !== "string")
    raw = value != null ? [String(value)] : [];
  else if (value.includes(";")) {
    raw = value
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (value.includes(",")) {
    raw = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    raw = value.trim() ? [value.trim()] : [];
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export interface NormalizedReference {
  url: string;
  label: string;
}

/** Flatten ObjectReferences maps (`{ public: { 1: url } }`) into leaf values. */
export function flattenReferences(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenReferences(item));
  }
  if (typeof value === "string") return [value];
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      flattenReferences(item),
    );
  }
  return [];
}

/** Normalize string URLs or `{ url, title, name, link, ... }` reference objects. */
export function normalizeReference(ref: unknown): NormalizedReference | null {
  if (typeof ref === "string") {
    const url = ref.trim();
    if (!url) return null;
    return { url, label: url };
  }

  if (!ref || typeof ref !== "object") return null;

  const record = ref as Record<string, unknown>;
  const urlCandidate = [record.url, record.link, record.href].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (typeof urlCandidate !== "string") return null;

  const url = urlCandidate.trim();
  const labelCandidate = [
    record.title,
    record.name,
    record.label,
    record.text,
  ].find((value) => typeof value === "string" && value.trim());
  const label =
    typeof labelCandidate === "string" ? labelCandidate.trim() : url;

  return { url, label };
}

export type TerrainScopeKind = "Domains" | "Targets" | "Platforms";

export interface ParsedTerrain {
  narrative: string;
  scopes: Array<{ kind: TerrainScopeKind; values: string[] }>;
  inlinePaths: string[];
}

const SCOPED_PATH_RE = /(?:[A-Za-z][A-Za-z0-9]*::)+[A-Za-z0-9][A-Za-z0-9_.-]*/g;
const SCOPE_LINE_RE = /^(Domains|Targets|Platforms):\s*(.+)$/i;

/** Split legacy terrain markdown into narrative prose and structured surface scopes. */
export function parseTerrainMarkdown(text: string): ParsedTerrain {
  const lines = text.split("\n");
  const scopes: ParsedTerrain["scopes"] = [];
  let cutIndex = lines.length;

  while (cutIndex > 0) {
    const line = lines[cutIndex - 1]?.trim() ?? "";
    if (!line) {
      cutIndex -= 1;
      continue;
    }
    const match = line.match(SCOPE_LINE_RE);
    if (!match?.[2]) break;
    const values = match[2]
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean);
    scopes.unshift({
      kind: match[1] as TerrainScopeKind,
      values,
    });
    cutIndex -= 1;
  }

  const narrative = lines.slice(0, cutIndex).join("\n").trim();
  const rawPaths = (text.match(SCOPED_PATH_RE) ?? []).map(normalizeScopedPath);
  const inlinePaths = preferLongestScopedPaths(rawPaths);

  return { narrative, scopes, inlinePaths };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match surface vocabulary terms mentioned in free-form terrain prose. */
export function findSurfaceTermsInText(
  index: VocabIndex,
  text: string,
): string[] {
  const bucket = index.surface;
  if (!bucket || !text.trim()) return [];

  const matches = new Map<string, number>();

  for (const [key, term] of Object.entries(bucket)) {
    const candidates = new Set<string>([
      key,
      term.name,
      ...(term.aliases ?? []),
    ]);
    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      if (trimmed.length < 2) continue;

      if (trimmed.includes("::")) {
        if (text.includes(trimmed)) {
          matches.set(key, Math.max(matches.get(key) ?? 0, trimmed.length));
        }
        continue;
      }

      const re = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i");
      if (re.test(text)) {
        matches.set(key, Math.max(matches.get(key) ?? 0, trimmed.length));
      }
    }
  }

  return [...matches.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
    .filter(
      (key, _i, all) =>
        !all.some(
          (other) =>
            other !== key &&
            other.startsWith(`${key}::`) &&
            text.includes(other),
        ),
    );
}

function normalizeScopedPath(path: string): string {
  return path.replace(/[.,;:!?)]+$/g, "");
}

function preferLongestScopedPaths(paths: string[]): string[] {
  const unique = [...new Set(paths.filter(Boolean))];
  return unique.filter(
    (path) =>
      !unique.some((other) => other !== path && other.startsWith(`${path}::`)),
  );
}
