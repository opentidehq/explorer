#!/usr/bin/env node
/**
 * Generates explorer export JSON from a local OpenTide corpus.
 * Used for dev builds and CI when `opentide generate explorer` is unavailable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function resolveCorpusRoot() {
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

function countRelations(uuid, models, flatIndex) {
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

function buildCoverage(summaries, attackNavPath) {
  const gaps = [];

  for (const summary of summaries) {
    if (summary.type === "signal") {
      const hasRule = summaries.some(
        (s) =>
          s.type === "rule" &&
          flatIndexRef[s.uuid]?.detection_model === summary.uuid,
      );
      if (!hasRule) {
        gaps.push({
          kind: "signal-no-rules",
          objectId: summary.uuid,
          objectName: summary.name,
          detail: "No downstream detection rules",
        });
      }
    }
    if (summary.type === "rule" && !summary.techniques.length) {
      gaps.push({
        kind: "mdr-only",
        objectId: summary.uuid,
        objectName: summary.name,
        detail: "Rule has no resolved ATT&CK techniques",
      });
    }
  }

  const techniqueMatrix = {};
  if (attackNavPath && fs.existsSync(attackNavPath)) {
    const nav = JSON.parse(fs.readFileSync(attackNavPath, "utf8"));
    for (const tech of nav.techniques ?? []) {
      techniqueMatrix[tech.techniqueID] = {
        color: tech.color,
        comment: tech.comment,
        objects: [],
      };
    }
  }

  const platformRollup = {};
  for (const s of summaries.filter((x) => x.type === "rule")) {
    for (const platform of s.platforms) {
      platformRollup[platform] = platformRollup[platform] ?? {
        total: 0,
        covered: 1,
      };
      platformRollup[platform].total += 1;
    }
  }

  return { gaps, techniqueMatrix, platformRollup };
}

let flatIndexRef = {};

function buildSearchDocuments(summaries, flatIndex) {
  return summaries.map((s) => ({
    id: s.uuid,
    uuid: s.uuid,
    type: s.type,
    name: s.name,
    techniques: s.techniques,
    platforms: s.platforms,
    status: s.status ?? "",
    content: JSON.stringify(flatIndex[s.uuid] ?? {}).slice(0, 4000),
  }));
}

async function main() {
  const corpusRoot = resolveCorpusRoot();
  const outDir = path.join(ROOT, "public", "data");
  fs.mkdirSync(outDir, { recursive: true });

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

  flatIndexRef = flatIndex;
  const chaining = buildChainingIndex(models);

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
      relatedCount: countRelations(uuid, models, flatIndex),
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
  };

  const attackNavPath = path.join(
    corpusRoot,
    ".opentide",
    "exports",
    "attack-navigator.json",
  );

  const coverage = buildCoverage(summaries, attackNavPath);
  const search = { documents: buildSearchDocuments(summaries, flatIndex) };

  fs.writeFileSync(
    path.join(outDir, "explorer.bundle.json"),
    JSON.stringify(bundle),
  );
  fs.writeFileSync(
    path.join(outDir, "explorer.coverage.json"),
    JSON.stringify(coverage),
  );
  fs.writeFileSync(
    path.join(outDir, "explorer.search.json"),
    JSON.stringify(search),
  );

  if (fs.existsSync(attackNavPath)) {
    fs.copyFileSync(attackNavPath, path.join(outDir, "attack-navigator.json"));
  }

  const vocabPath = path.join(
    corpusRoot,
    ".opentide",
    "exports",
    "vocab.att&ck.json",
  );
  if (fs.existsSync(vocabPath)) {
    fs.copyFileSync(vocabPath, path.join(outDir, "vocab.att&ck.json"));
  }

  console.log(`Wrote exports to ${outDir} (${summaries.length} objects)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
