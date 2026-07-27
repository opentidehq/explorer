#!/usr/bin/env node
/**
 * Generates explorer export JSON from a local OpenTide corpus.
 * Used for dev builds and CI when `opentide generate explorer` is unavailable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { codegenFromSpecs } from "./codegen-from-specs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
  const actors = new Set();
  if (type === "threat") {
    for (const actor of body?.threat?.actors ?? body?.actors ?? []) {
      if (typeof actor === "string") actors.add(actor);
    }
  }
  return [...actors];
}

function buildChainingIndex(models) {
  const chaining = {};
  for (const threat of Object.values(models.threat)) {
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

function resolveTechniques(uuid, flatIndex, cache = new Map()) {
  if (cache.has(uuid)) return cache.get(uuid);
  const body = flatIndex[uuid];
  const type = inferType(body);
  let techniques = [];

  if (type === "threat") {
    techniques = body?.threat?.["att&ck"] ?? [];
  } else if (type === "objective") {
    techniques = body?.objective?.["att&ck"] ?? [];
    if (!techniques.length) {
      for (const parent of body?.objective?.threats ?? []) {
        techniques.push(...resolveTechniques(parent, flatIndex, cache));
      }
    }
  } else if (type === "rule") {
    const parent = body?.detection_model ?? body?.tags?.coretide;
    if (parent) {
      techniques = resolveTechniques(parent, flatIndex, cache);
    }
  }

  techniques = [...new Set(techniques)];
  cache.set(uuid, techniques);
  return techniques;
}

function countRelations(uuid, flatIndex) {
  let count = 0;
  const body = flatIndex[uuid];
  const type = inferType(body);
  if (type === "objective") {
    count += (body?.objective?.threats ?? []).length;
  }
  if (type === "signal" || type === "rule") {
    const parent = body?.parent ?? body?.detection_model;
    if (parent) count += 1;
  }
  for (const [, obj] of Object.entries(flatIndex)) {
    const t = inferType(obj);
    if (t === "objective" && (obj?.objective?.threats ?? []).includes(uuid))
      count += 1;
    if (
      (t === "signal" || t === "rule") &&
      (obj?.parent === uuid || obj?.detection_model === uuid)
    )
      count += 1;
  }
  return count;
}

function buildStagingIndex(models) {
  const deployments = {};
  const platformSummary = {};
  const stagingObjects = new Set();
  const productionObjects = new Set();

  for (const [uuid, body] of Object.entries(models.rule)) {
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

function buildSearchDocuments(summaries, flatIndex) {
  return summaries.map((s) => ({
    id: s.uuid,
    uuid: s.uuid,
    type: s.type,
    name: s.name,
    techniques: s.techniques,
    actors: s.actors,
    platforms: s.platforms,
    schema: s.schema ?? "",
    tlp: s.tlp ?? "",
    status: s.status ?? "",
    relatedCount: s.relatedCount,
    content: JSON.stringify(flatIndex[s.uuid] ?? {}).slice(0, 4000),
  }));
}

async function main() {
  const corpusRoot = resolveCorpusRoot();
  const outDir = path.join(ROOT, "public", "data");
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const specsDir =
      process.env.SPECIFICATIONS_REPO_ROOT ??
      path.resolve(corpusRoot ?? ROOT, "..", "specifications");
    codegenFromSpecs(specsDir);
  } catch (err) {
    console.warn(
      "Schema codegen skipped:",
      err instanceof Error ? err.message : err,
    );
  }

  const models = { threat: {}, objective: {}, signal: {}, rule: {} };
  const flatIndex = {};
  const signals = {};

  if (!corpusRoot) {
    console.warn("No corpus found — writing minimal fixture bundle");
    const fixturePath = path.join(__dirname, "fixture-bundle.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    for (const [name, data] of Object.entries(fixture)) {
      fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2));
    }
    return;
  }

  const objectFiles = walkYamlFiles(path.join(corpusRoot, "objects"));
  console.log(`Loading ${objectFiles.length} objects from ${corpusRoot}`);

  for (const file of objectFiles) {
    const body = parseYaml(fs.readFileSync(file, "utf8"));
    const type = inferType(body);
    const uuid = body?.metadata?.uuid;
    if (!type || !uuid) continue;
    if (!(type in models)) continue;
    models[type][uuid] = body;
    flatIndex[uuid] = body;
    if (type === "signal") signals[uuid] = body;
  }

  for (const [objectiveUuid, body] of Object.entries(models.objective)) {
    const embedded = body?.objective?.signals ?? [];
    for (const signal of embedded) {
      const signalUuid = signal?.uuid;
      if (!signalUuid || models.signal[signalUuid]) continue;
      const signalBody = {
        ...signal,
        name: signal.name ?? signalUuid,
        metadata: { uuid: signalUuid, schema: "signal::1.0" },
        parent: objectiveUuid,
      };
      models.signal[signalUuid] = signalBody;
      flatIndex[signalUuid] = signalBody;
      signals[signalUuid] = signalBody;
    }
  }

  const chaining = buildChainingIndex(models);
  const stagingIndex = buildStagingIndex(models);

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
      techniques: resolveTechniques(uuid, flatIndex),
      actors: getActors(body, type),
      relatedCount: countRelations(uuid, flatIndex),
      platforms: getPlatforms(body, type),
    };
  });

  const bundle = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    models,
    flatIndex,
    chaining,
    signals,
    summaries,
    stagingIndex,
  };

  const search = { documents: buildSearchDocuments(summaries, flatIndex) };

  fs.writeFileSync(
    path.join(outDir, "explorer.bundle.json"),
    JSON.stringify(bundle),
  );
  fs.writeFileSync(
    path.join(outDir, "explorer.search.json"),
    JSON.stringify(search),
  );

  const vocabPath = path.join(
    corpusRoot,
    ".opentide",
    "exports",
    "vocab.att&ck.json",
  );
  if (fs.existsSync(vocabPath)) {
    fs.copyFileSync(vocabPath, path.join(outDir, "vocab.att&ck.json"));
  }

  console.log(
    `Wrote exports to ${outDir} (${summaries.length} objects, staging index: ${stagingIndex.stagingObjects.length} staging rules)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
