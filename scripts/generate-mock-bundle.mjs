#!/usr/bin/env node
/**
 * Generates explorer export JSON from a local OpenTide corpus.
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

function resolveCorpusRoot() {
  if (process.env.OPENTIDE_USE_FIXTURE === "1") {
    return null;
  }

  const candidates = [
    process.env.OPENTIDE_REPO_ROOT,
    path.resolve(ROOT, "../library"),
    path.resolve(ROOT, "../../library"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const objectsDir = path.join(candidate, "objects");
    if (fs.existsSync(objectsDir)) return candidate;
  }
  return null;
}

function walkYamlFiles(dir) {
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

function inferType(body) {
  const schema = body?.metadata?.schema;
  if (typeof schema === "string") return schema.split("::")[0];
  if (body?.configurations) return "rule";
  if (body?.objective) return "objective";
  if (body?.threat) return "threat";
  if (body?.signal || body?.parent) return "signal";
  return null;
}

function getPlatforms(body, type) {
  const platforms = new Set();
  if (type === "rule" && body.configurations) {
    for (const key of Object.keys(body.configurations)) {
      platforms.add(key.replace(/_/g, " "));
    }
  }
  return [...platforms];
}

function getStatus(body, type) {
  if (type !== "rule" || !body.configurations) return undefined;
  const statuses = Object.values(body.configurations).map((c) => c?.status);
  if (statuses.includes("PRODUCTION")) return "PRODUCTION";
  if (statuses.includes("STAGING")) return "STAGING";
  return statuses[0];
}

function getActors(body, type) {
  if (type !== "threat") return [];
  return collectActorNames(body?.threat?.actors ?? body?.actors ?? []);
}

function buildChainingIndex(threats) {
  const chaining = {};
  for (const threat of threats) {
    const uuid = threat.metadata?.uuid;
    const links = threat.threat?.chaining ?? [];
    if (!uuid || !links.length) continue;
    chaining[uuid] = chaining[uuid] ?? {};
    for (const link of links) {
      const relation = link.relation;
      const vector = link.vector;
      if (!relation || !vector) continue;
      chaining[uuid][relation] = chaining[uuid][relation] ?? [];
      if (!chaining[uuid][relation].includes(vector)) {
        chaining[uuid][relation].push(vector);
      }
    }
  }
  return chaining;
}

/** ATT&CK keys across schema generations: `mitre_attack` (specs), `att&ck`, `attack`. */
function ownTechniques(section) {
  return techniqueList(
    section?.mitre_attack,
    section?.["att&ck"],
    section?.attack,
  );
}

function resolveTechniques(
  uuid,
  flatIndex,
  cache = new Map(),
  seen = new Set(),
) {
  if (cache.has(uuid)) return cache.get(uuid);
  // Malformed corpora can reference themselves; never recurse forever.
  if (seen.has(uuid)) return [];
  seen.add(uuid);

  const body = flatIndex[uuid];
  const type = inferType(body);
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

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Direct parent and child links per object, counted once across the corpus. */
function countRelations(flatIndex) {
  const counts = new Map(Object.keys(flatIndex).map((uuid) => [uuid, 0]));
  const bump = (uuid) => {
    if (counts.has(uuid)) counts.set(uuid, counts.get(uuid) + 1);
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

function buildStagingIndex(rules) {
  const deployments = {};
  const platformSummary = {};
  const stagingObjects = new Set();
  const productionObjects = new Set();

  for (const [uuid, body] of rules) {
    const configs = body?.configurations ?? {};
    deployments[uuid] = {};
    for (const [platform, config] of Object.entries(configs)) {
      const status = String(config?.status ?? "UNKNOWN").toUpperCase();
      deployments[uuid][platform] = status;

      platformSummary[platform] = platformSummary[platform] ?? {
        production: 0,
        staging: 0,
        other: 0,
      };
      if (status === "PRODUCTION") {
        platformSummary[platform].production += 1;
        productionObjects.add(uuid);
      } else if (status === "STAGING") {
        platformSummary[platform].staging += 1;
        stagingObjects.add(uuid);
      } else {
        platformSummary[platform].other += 1;
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

  const flatIndex = {};
  const paths = {};
  const byType = { threat: [], objective: [], signal: [], rule: [] };

  const objectFiles = walkYamlFiles(path.join(corpusRoot, "objects"));
  console.log(`Loading ${objectFiles.length} objects from ${corpusRoot}`);

  for (const file of objectFiles) {
    const body = parseYaml(fs.readFileSync(file, "utf8"));
    const type = inferType(body);
    const uuid = body?.metadata?.uuid;
    if (!type || !uuid || !(type in byType)) continue;
    if (flatIndex[uuid]) {
      console.warn(`Duplicate uuid ${uuid} in ${file} — keeping the first`);
      continue;
    }
    flatIndex[uuid] = body;
    paths[uuid] = path.relative(corpusRoot, file).split(path.sep).join("/");
    byType[type].push(uuid);
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
      paths[signalUuid] = paths[objectiveUuid];
      byType.signal.push(signalUuid);
    }
  }

  const chaining = buildChainingIndex(
    byType.threat.map((uuid) => flatIndex[uuid]),
  );
  const stagingIndex = buildStagingIndex(
    byType.rule.map((uuid) => [uuid, flatIndex[uuid]]),
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
