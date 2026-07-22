/**
 * Parse OpenTide specifications TOML (pins + vocabularies) with smol-toml.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

/** @typedef {{ name: string, description?: string, stage?: string, stages?: string[] }} VocabTerm */

/**
 * @param {string} specsDir
 * @returns {string}
 */
export function resolveSpecsDir(specsDir) {
  if (specsDir && fs.existsSync(specsDir)) return specsDir;
  throw new Error(
    `Specifications directory not found: ${specsDir ?? "(unset)"}`,
  );
}

/**
 * @param {string} filePath
 */
function parseTomlFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content);
}

/**
 * `severity::1.0` → `severity`
 * @param {string} ref
 */
export function vocabRefToStem(ref) {
  if (typeof ref !== "string") return undefined;
  const stem = ref.split("::")[0]?.trim();
  return stem || undefined;
}

/**
 * Compare pin schema version strings (`1.0` vs `2.1`).
 * @param {string} a
 * @param {string} b
 */
export function comparePinVersions(a, b) {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * @param {string} schemaKey e.g. `threat::2.1`
 */
function parseSchemaKey(schemaKey) {
  const idx = schemaKey.indexOf("::");
  if (idx === -1) return { type: schemaKey, version: "0" };
  return {
    type: schemaKey.slice(0, idx),
    version: schemaKey.slice(idx + 2),
  };
}

/**
 * @param {Record<string, unknown>} doc Parsed *.vocab.toml
 * @param {string} fileStem e.g. `severity.vocab`
 * @returns {{ vocabKey: string, index: Record<string, VocabTerm> }}
 */
export function parseVocabDocument(doc, fileStem) {
  const vocabKey = fileStem.replace(/\.vocab$/, "").replace(/\.toml$/, "");
  /** @type {Record<string, VocabTerm>} */
  const index = {};

  const keys = doc.keys;
  if (!Array.isArray(keys)) return { vocabKey, index };

  for (const raw of keys) {
    if (!raw || typeof raw !== "object") continue;
    const entry = /** @type {Record<string, unknown>} */ (raw);
    const name = entry.name;
    if (typeof name !== "string" || !name) continue;

    const description =
      typeof entry.description === "string" ? entry.description : undefined;
    const stagesRaw = entry["tide.vocab.stages"];
    /** @type {string[] | undefined} */
    let tacticStages;
    /** @type {string | undefined} */
    let compoundStage;
    if (Array.isArray(stagesRaw)) {
      tacticStages = stagesRaw.filter((s) => typeof s === "string" && s);
    } else if (typeof stagesRaw === "string") {
      compoundStage = stagesRaw;
    }
    const id = typeof entry.id === "string" ? entry.id : undefined;
    const link = typeof entry.link === "string" ? entry.link : undefined;
    const aliases = Array.isArray(entry.alias)
      ? entry.alias.filter((a) => typeof a === "string" && a.length > 0)
      : undefined;

    const term = {
      name,
      description,
      ...(tacticStages?.length
        ? { stages: tacticStages, stage: tacticStages[0] }
        : {}),
      ...(compoundStage && !tacticStages?.length
        ? { stage: compoundStage }
        : {}),
      ...(link ? { link } : {}),
      ...(aliases?.length ? { aliases } : {}),
    };

    const register = (key) => {
      if (!key || index[key]) return;
      index[key] = term;
    };

    register(name);
    if (compoundStage) register(`${compoundStage}::${name}`);
    if (id) {
      register(id);
      if (compoundStage) register(`${compoundStage}::${id}`);
    }
    if (aliases) {
      for (const alias of aliases) {
        register(alias);
        if (compoundStage) register(`${compoundStage}::${alias}`);
      }
    }
    if (tacticStages) {
      for (const tactic of tacticStages) {
        register(`${tactic}::${name}`);
        if (id) register(`${tactic}::${id}`);
        if (aliases) {
          for (const alias of aliases) {
            register(`${tactic}::${alias}`);
          }
        }
      }
    }
  }

  return { vocabKey, index };
}

/**
 * @param {string} vocabDir
 * @returns {Record<string, Record<string, VocabTerm>>}
 */
export function buildVocabIndexFromDir(vocabDir) {
  if (!fs.existsSync(vocabDir)) {
    throw new Error(`Vocabularies directory not found: ${vocabDir}`);
  }

  /** @type {Record<string, Record<string, VocabTerm>>} */
  const merged = {};

  for (const file of fs.readdirSync(vocabDir).sort()) {
    if (!file.endsWith(".vocab.toml")) continue;
    const doc = parseTomlFile(path.join(vocabDir, file));
    const { vocabKey, index } = parseVocabDocument(
      doc,
      file.replace(".toml", ""),
    );
    if (!Object.keys(index).length) continue;
    merged[vocabKey] = { ...merged[vocabKey], ...index };
  }

  return merged;
}

const SKIP_PIN_PATHS = new Set(["threat.chaining"]);

const FORMAT_OVERRIDES = {
  "threat.att&ck": "attack",
  techniques: "attack",
  "objective.attack": "attack",
  references: "references",
};

const LABEL_OVERRIDES = {
  "threat.terrain": "Surface",
  "threat.att&ck": "ATT&CK",
  techniques: "ATT&CK",
  "objective.attack": "ATT&CK",
  "objective.composition.strategy": "Composition",
  "objective.composition.description": "Composition details",
  "composition.strategy": "Composition",
  "composition.description": "Composition details",
  "objective.signals.data.logsources": "Data sources",
  criticality: "Criticality",
  "metadata.tlp": "TLP",
  "metadata.schema": "Schema",
  "metadata.version": "Version",
  "threat.killchain": "Kill chain",
  "threat.actors": "Threat actors",
  "data.logsources": "Data sources",
};

/**
 * @param {string} pathKey
 */
export function pathToLabel(pathKey) {
  if (LABEL_OVERRIDES[pathKey]) return LABEL_OVERRIDES[pathKey];
  const leaf = pathKey.split(".").pop() ?? pathKey;
  if (leaf === "att&ck") return "ATT&CK";
  return leaf.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {string} pathKey
 * @param {string | undefined} vocabStem
 */
function inferFieldFormat(pathKey, vocabStem) {
  if (FORMAT_OVERRIDES[pathKey]) return FORMAT_OVERRIDES[pathKey];
  if (pathKey.includes("chaining")) return null;
  if (vocabStem === "att&ck") return "attack";
  if (vocabStem === "surface") return "surface";
  if (vocabStem) return "pills";
  return "text";
}

/**
 * Normalize pin paths to object-rooted dot paths.
 * @param {string} objectType
 * @param {string} pathKey
 */
function normalizePinPath(objectType, pathKey) {
  if (pathKey.startsWith("metadata.")) return pathKey;
  if (pathKey === "criticality") return pathKey;
  if (objectType === "threat" && pathKey.startsWith("threat.")) return pathKey;
  if (objectType === "rule") return pathKey;
  if (objectType === "objective") {
    if (pathKey.startsWith("objective.")) return pathKey;
    if (pathKey.startsWith("composition.")) return `objective.${pathKey}`;
    return `objective.${pathKey}`;
  }
  return pathKey;
}

/**
 * Map objective embedded-signal pins to standalone signal field paths.
 * @param {string} pathKey
 */
export function signalPathFromObjectivePin(pathKey) {
  const prefix = "objective.signals.";
  if (!pathKey.startsWith(prefix)) return null;
  const rest = pathKey.slice(prefix.length);
  if (rest === "data.logsources") return "data.logsources";
  return rest;
}

/** Explorer fields not expressed in pin tables. */
const EXPLORER_EXTRA_FIELDS = {
  threat: [
    { path: "metadata.schema", label: "Schema", format: "text" },
    { path: "metadata.version", label: "Version", format: "text" },
    { path: "references", label: "References", format: "references" },
  ],
  objective: [
    { path: "objective.investment", label: "Investment", format: "pills" },
    {
      path: "objective.priority",
      label: "Priority",
      format: "pills",
      vocab: "criticality",
    },
    {
      path: "objective.composition.description",
      label: "Composition details",
      format: "markdown",
    },
  ],
  signal: [
    { path: "data.availability", label: "Data availability", format: "text" },
    {
      path: "data.requirements",
      label: "Data requirements",
      format: "markdown",
    },
  ],
  rule: [
    { path: "metadata.schema", label: "Schema", format: "text" },
    { path: "metadata.version", label: "Version", format: "text" },
    { path: "metadata.created", label: "Created", format: "text" },
    { path: "metadata.modified", label: "Modified", format: "text" },
    { path: "metadata.author", label: "Author", format: "text" },
    { path: "description", label: "Description", format: "markdown" },
    { path: "detection_model", label: "Detection model", format: "text" },
    {
      path: "response.procedure.analysis",
      label: "Response analysis",
      format: "markdown",
    },
    {
      path: "response.procedure.containment",
      label: "Containment",
      format: "markdown",
    },
    { path: "references", label: "References", format: "references" },
    { path: "_status", label: "Status", format: "text" },
  ],
};

/**
 * @typedef {{ path: string, label: string, format: string, vocab?: string }} FieldDef
 */

/**
 * @param {string} pinsDir
 * @returns {Record<string, FieldDef[]>}
 */
export function buildFieldRegistryFromPins(pinsDir) {
  if (!fs.existsSync(pinsDir)) {
    throw new Error(`Pins directory not found: ${pinsDir}`);
  }

  /** @type {Record<string, Map<string, FieldDef & { pinVersion: string }>>} */
  const byType = {
    threat: new Map(),
    objective: new Map(),
    rule: new Map(),
    signal: new Map(),
  };

  for (const file of fs.readdirSync(pinsDir).sort()) {
    if (!file.endsWith(".toml")) continue;
    const objectType = file.replace(/\.toml$/, "");
    if (!(objectType in byType)) continue;

    const doc = parseTomlFile(path.join(pinsDir, file));

    for (const [schemaKey, table] of Object.entries(doc)) {
      if (!table || typeof table !== "object" || Array.isArray(table)) continue;
      const { type, version } = parseSchemaKey(schemaKey);
      if (type !== objectType) continue;

      for (const [rawPath, vocabRef] of Object.entries(
        /** @type {Record<string, unknown>} */ (table),
      )) {
        if (typeof vocabRef !== "string") continue;
        const pathKey = normalizePinPath(objectType, rawPath);
        if (SKIP_PIN_PATHS.has(pathKey)) continue;

        const vocabStem = vocabRefToStem(vocabRef);
        const format = inferFieldFormat(pathKey, vocabStem);
        if (!format) continue;

        /** @type {FieldDef} */
        const field = {
          path: pathKey,
          label: pathToLabel(pathKey),
          format,
          ...(vocabStem && (format === "pills" || format === "surface")
            ? { vocab: vocabStem }
            : {}),
        };

        const map = byType[objectType];
        const existing = map.get(pathKey);
        if (
          !existing ||
          comparePinVersions(version, existing.pinVersion) >= 0
        ) {
          map.set(pathKey, { ...field, pinVersion: version });
        }

        const signalPath = signalPathFromObjectivePin(pathKey);
        if (signalPath && objectType === "objective") {
          const signalField = {
            path: signalPath,
            label: pathToLabel(signalPath),
            format,
            ...(vocabStem && (format === "pills" || format === "surface")
              ? { vocab: vocabStem }
              : {}),
          };
          const signalExisting = byType.signal.get(signalPath);
          if (
            !signalExisting ||
            comparePinVersions(version, signalExisting.pinVersion) >= 0
          ) {
            byType.signal.set(signalPath, {
              ...signalField,
              pinVersion: version,
            });
          }
        }
      }
    }
  }

  /** @type {Record<string, FieldDef[]>} */
  const registry = {};

  for (const [type, map] of Object.entries(byType)) {
    const fields = [...map.values()]
      .map(({ pinVersion: _v, ...field }) => field)
      .sort((a, b) => a.path.localeCompare(b.path));

    const extras = EXPLORER_EXTRA_FIELDS[type] ?? [];
    const seen = new Set(fields.map((f) => f.path));
    for (const extra of extras) {
      if (!seen.has(extra.path)) fields.push(extra);
    }

    registry[type] = fields;
  }

  return registry;
}
