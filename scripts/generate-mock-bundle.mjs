#!/usr/bin/env node
/**
 * Generates explorer export JSON from a local opentide corpus.
 * Used for dev builds and CI when `opentide generate explorer` is unavailable.
 *
 * Writes to public/data:
 *   explorer.bundle.json  objects (once, in `flatIndex`), summaries, chaining, deployments
 *   explorer.vocab.json   the vocabulary terms the client reads (see lib/slim-vocab.mjs)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { codegenFromSpecs } from "./codegen-from-specs.mjs";
import { resolveCodegenPolicy } from "./lib/codegen-policy.mjs";
import {
  collectActorNames,
  normalizeRepoUrl,
  techniqueList,
} from "./lib/corpus-fields.mjs";
import { collectCorpusValues, slimVocabIndex } from "./lib/slim-vocab.mjs";
import { isMain } from "./lib/is-main.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** Bundle layout version: 0.2 drops the `models` and `signals` copies of `flatIndex`. */
const BUNDLE_VERSION = "0.2.0";

/**
 * A parsed corpus YAML document. Its shape differs across schema generations, so every
 * read below is optional-chained instead of trusting one layout.
 * @typedef {any} CorpusObject
 */
/** @typedef {"threat" | "objective" | "signal" | "rule"} ObjectType */

function resolveCorpusRoot() {
  if (process.env.OPENTIDE_USE_FIXTURE === "1") {
    return null;
  }

  const candidates = /** @type {string[]} */ (
    [
      process.env.OPENTIDE_REPO_ROOT,
      path.resolve(ROOT, "../library"),
      path.resolve(ROOT, "../../library"),
    ].filter(Boolean)
  );

  for (const candidate of candidates) {
    const objectsDir = path.join(candidate, "objects");
    if (fs.existsSync(objectsDir)) return candidate;
  }
  return null;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walkYamlFiles(dir) {
  /** @type {string[]} */
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkYamlFiles(full));
    else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))
      files.push(full);
  }
  return files;
}

/**
 * @param {CorpusObject} body
 * @returns {string | null}
 */
function inferType(body) {
  const schema = body?.metadata?.schema;
  if (typeof schema === "string") return schema.split("::")[0] ?? null;
  if (body?.configurations) return "rule";
  if (body?.objective) return "objective";
  if (body?.threat) return "threat";
  if (body?.signal || body?.parent) return "signal";
  return null;
}

/**
 * @param {CorpusObject} body
 * @param {string | null} type
 */
function getPlatforms(body, type) {
  /** @type {Set<string>} */
  const platforms = new Set();
  if (type === "rule" && body.configurations) {
    for (const key of Object.keys(body.configurations)) {
      platforms.add(key.replace(/_/g, " "));
    }
  }
  return [...platforms];
}

/**
 * @param {CorpusObject} body
 * @param {string | null} type
 * @returns {string | undefined}
 */
function getStatus(body, type) {
  if (type !== "rule" || !body.configurations) return undefined;
  const statuses = Object.values(
    /** @type {Record<string, CorpusObject>} */ (body.configurations),
  ).map((c) => c?.status);
  if (statuses.includes("PRODUCTION")) return "PRODUCTION";
  if (statuses.includes("STAGING")) return "STAGING";
  return statuses[0];
}

/**
 * @param {CorpusObject} body
 * @param {string | null} type
 */
function getActors(body, type) {
  if (type !== "threat") return [];
  return collectActorNames(body?.threat?.actors ?? body?.actors ?? []);
}

/** @param {CorpusObject[]} threats */
function buildChainingIndex(threats) {
  /** @type {Record<string, Record<string, string[]>>} */
  const chaining = {};
  for (const threat of threats) {
    const uuid = threat.metadata?.uuid;
    const links = threat.threat?.chaining ?? [];
    if (!uuid || !links.length) continue;
    const relations = (chaining[uuid] ??= {});
    for (const link of links) {
      const relation = link.relation;
      const vector = link.vector;
      if (!relation || !vector) continue;
      const vectors = (relations[relation] ??= []);
      if (!vectors.includes(vector)) vectors.push(vector);
    }
  }
  return chaining;
}

/** ATT&CK keys across schema generations: `mitre_attack` (specs), `att&ck`, `attack`. */
/** @param {CorpusObject} section */
function ownTechniques(section) {
  return techniqueList(
    section?.mitre_attack,
    section?.["att&ck"],
    section?.attack,
  );
}

/**
 * @param {string} uuid
 * @param {Record<string, CorpusObject>} flatIndex
 * @param {Map<string, string[]>} cache
 * @param {Set<string>} seen
 * @returns {string[]}
 */
function resolveTechniques(
  uuid,
  flatIndex,
  cache = new Map(),
  seen = new Set(),
) {
  const cached = cache.get(uuid);
  if (cached) return cached;
  // Malformed corpora can reference themselves; never recurse forever.
  if (seen.has(uuid)) return [];
  seen.add(uuid);

  const body = flatIndex[uuid];
  const type = inferType(body);
  /** @type {string[]} */
  let techniques = [];

  if (type === "threat") {
    techniques = ownTechniques(body?.threat);
  } else if (type === "objective") {
    techniques = ownTechniques(body?.objective);
    if (!techniques.length) {
      for (const parent of body?.objective?.threats ?? []) {
        techniques.push(...resolveTechniques(parent, flatIndex, cache, seen));
      }
    }
  } else if (type === "rule") {
    const parent = body?.detection_model ?? body?.tags?.coretide;
    if (parent) {
      techniques = resolveTechniques(parent, flatIndex, cache, seen);
    }
  }

  techniques = [...new Set(techniques)];
  cache.set(uuid, techniques);
  return techniques;
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Direct parent and child links per object, counted once across the corpus. */
/** @param {Record<string, CorpusObject>} flatIndex */
function countRelations(flatIndex) {
  const counts = new Map(Object.keys(flatIndex).map((uuid) => [uuid, 0]));
  /** @param {unknown} uuid */
  const bump = (uuid) => {
    if (typeof uuid !== "string") return;
    const count = counts.get(uuid);
    if (count !== undefined) counts.set(uuid, count + 1);
  };

  for (const [uuid, body] of Object.entries(flatIndex)) {
    const type = inferType(body);
    if (type === "objective") {
      for (const threat of asList(body?.objective?.threats)) {
        bump(uuid);
        bump(threat);
      }
    }
    if (type === "signal" || type === "rule") {
      for (const parent of asList(body?.parent ?? body?.detection_model)) {
        bump(uuid);
        bump(parent);
      }
    }
  }
  return counts;
}

/** @param {Array<[string, CorpusObject]>} rules */
function buildStagingIndex(rules) {
  /** @type {Record<string, Record<string, string>>} */
  const deployments = {};
  /** @type {Record<string, { production: number, staging: number, other: number }>} */
  const platformSummary = {};
  /** @type {Set<string>} */
  const stagingObjects = new Set();
  /** @type {Set<string>} */
  const productionObjects = new Set();

  for (const [uuid, body] of rules) {
    /** @type {Record<string, CorpusObject>} */
    const configs = body?.configurations ?? {};
    /** @type {Record<string, string>} */
    const statuses = {};
    deployments[uuid] = statuses;
    for (const [platform, config] of Object.entries(configs)) {
      const status = String(config?.status ?? "UNKNOWN").toUpperCase();
      statuses[platform] = status;

      const summary = (platformSummary[platform] ??= {
        production: 0,
        staging: 0,
        other: 0,
      });
      if (status === "PRODUCTION") {
        summary.production += 1;
        productionObjects.add(uuid);
      } else if (status === "STAGING") {
        summary.staging += 1;
        stagingObjects.add(uuid);
      } else {
        summary.other += 1;
      }
    }
  }

  return {
    deployments,
    platformSummary,
    stagingObjects: [...stagingObjects],
    productionObjects: [...productionObjects],
  };
}

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/** Where the corpus lives, so the explorer can link each object to its file. */
/** @param {string} corpusRoot */
function resolveSource(corpusRoot) {
  const repository = normalizeRepoUrl(
    process.env.EXPLORER_SOURCE_REPO ??
      git(corpusRoot, ["config", "--get", "remote.origin.url"]),
  );
  if (!repository) return undefined;
  const ref =
    process.env.EXPLORER_SOURCE_REF ??
    (git(corpusRoot, ["rev-parse", "HEAD"]) || "main");
  return { repository, ref };
}

/** @param {string | null} corpusRoot */
function runSchemaCodegen(corpusRoot) {
  const specsDir =
    process.env.SPECIFICATIONS_REPO_ROOT ??
    path.resolve(corpusRoot ?? ROOT, "..", "specifications");
  const policy = resolveCodegenPolicy({
    specsDir,
    specsExist: fs.existsSync(specsDir),
    specsRootSet: Boolean(process.env.SPECIFICATIONS_REPO_ROOT),
    useFixture: process.env.OPENTIDE_USE_FIXTURE === "1" || corpusRoot == null,
    skipCodegen: process.env.OPENTIDE_SKIP_CODEGEN === "1",
  });

  if (policy.skip) {
    console.warn(`Schema codegen skipped: ${policy.reason}`);
    return;
  }

  if (!fs.existsSync(specsDir)) {
    throw new Error(
      `Schema codegen required (${policy.reason}). Set SPECIFICATIONS_REPO_ROOT or OPENTIDE_SKIP_CODEGEN=1.`,
    );
  }

  codegenFromSpecs(specsDir);
}

/**
 * @param {string} outDir
 * @param {unknown[]} objects
 */
function writeSlimVocab(outDir, objects) {
  const fullPath = path.join(outDir, "vocab.index.json");
  const slimPath = path.join(outDir, "explorer.vocab.json");
  if (!fs.existsSync(fullPath)) {
    console.warn(
      "vocab.index.json not found — explorer.vocab.json not written (run pnpm codegen:specs)",
    );
    fs.rmSync(slimPath, { force: true });
    return;
  }
  const index = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const slim = slimVocabIndex(index, collectCorpusValues(objects));
  fs.writeFileSync(slimPath, JSON.stringify(slim));
  /** @param {number} bytes */
  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
  console.log(
    `Wrote explorer.vocab.json (${kb(fs.statSync(slimPath).size)} from ${kb(fs.statSync(fullPath).size)})`,
  );
}

async function main() {
  const corpusRoot = resolveCorpusRoot();
  const outDir = path.join(ROOT, "public", "data");
  fs.mkdirSync(outDir, { recursive: true });
  // Earlier layouts shipped these; the client derives search and coverage itself now.
  for (const stale of [
    "explorer.search.json",
    "explorer.coverage.json",
    "vocab.att&ck.json",
  ]) {
    fs.rmSync(path.join(outDir, stale), { force: true });
  }

  runSchemaCodegen(corpusRoot);

  if (!corpusRoot) {
    console.warn("No corpus found — writing minimal fixture bundle");
    const fixturePath = path.join(__dirname, "fixture-bundle.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    for (const [name, data] of Object.entries(fixture)) {
      fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2));
    }
    // A slim vocabulary from an earlier corpus run would describe the wrong corpus.
    writeSlimVocab(
      outDir,
      Object.values(fixture["explorer.bundle.json"]?.flatIndex ?? {}),
    );
    return;
  }

  /** @type {Record<string, CorpusObject>} */
  const flatIndex = {};
  /** @type {Record<string, string>} */
  const paths = {};
  /** @type {Record<ObjectType, string[]>} */
  const byType = { threat: [], objective: [], signal: [], rule: [] };

  const objectFiles = walkYamlFiles(path.join(corpusRoot, "objects"));
  console.log(`Loading ${objectFiles.length} objects from ${corpusRoot}`);

  for (const file of objectFiles) {
    const body = parseYaml(fs.readFileSync(file, "utf8"));
    const type = inferType(body);
    const uuid = body?.metadata?.uuid;
    if (!type || !uuid || !Object.hasOwn(byType, type)) continue;
    if (flatIndex[uuid]) {
      console.warn(`Duplicate uuid ${uuid} in ${file} — keeping the first`);
      continue;
    }
    flatIndex[uuid] = body;
    paths[uuid] = path.relative(corpusRoot, file).split(path.sep).join("/");
    byType[/** @type {ObjectType} */ (type)].push(uuid);
  }

  // Objectives embed their signals; promote each to an object of its own.
  for (const objectiveUuid of byType.objective) {
    const body = flatIndex[objectiveUuid];
    for (const signal of body?.objective?.signals ?? []) {
      const signalUuid = signal?.uuid;
      if (!signalUuid || flatIndex[signalUuid]) continue;
      flatIndex[signalUuid] = {
        ...signal,
        name: signal.name ?? signalUuid,
        metadata: { uuid: signalUuid, schema: "signal::1.0" },
        parent: objectiveUuid,
      };
      const objectivePath = paths[objectiveUuid];
      if (objectivePath) paths[signalUuid] = objectivePath;
      byType.signal.push(signalUuid);
    }
  }

  const chaining = buildChainingIndex(
    byType.threat.map((uuid) => flatIndex[uuid]),
  );
  const stagingIndex = buildStagingIndex(
    byType.rule.map(
      (uuid) => /** @type {[string, CorpusObject]} */ ([uuid, flatIndex[uuid]]),
    ),
  );
  const relationCounts = countRelations(flatIndex);
  const techniqueCache = new Map();

  const summaries = Object.keys(flatIndex).map((uuid) => {
    const body = flatIndex[uuid];
    const type = inferType(body);
    return {
      uuid,
      type,
      name: body.name ?? uuid,
      schema: body.metadata?.schema,
      version: body.metadata?.version,
      tlp: body.metadata?.tlp,
      status: getStatus(body, type),
      techniques: resolveTechniques(uuid, flatIndex, techniqueCache),
      actors: getActors(body, type),
      relatedCount: relationCounts.get(uuid) ?? 0,
      platforms: getPlatforms(body, type),
      path: paths[uuid],
    };
  });

  const bundle = {
    version: BUNDLE_VERSION,
    generatedAt: new Date().toISOString(),
    source: resolveSource(corpusRoot),
    flatIndex,
    chaining,
    summaries,
    stagingIndex,
  };

  fs.writeFileSync(
    path.join(outDir, "explorer.bundle.json"),
    JSON.stringify(bundle),
  );
  writeSlimVocab(outDir, Object.values(flatIndex));

  console.log(
    `Wrote exports to ${outDir} (${summaries.length} objects, staging index: ${stagingIndex.stagingObjects.length} staging rules)`,
  );
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
