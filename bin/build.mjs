#!/usr/bin/env node
/**
 * @opentide/explorer build CLI
 * Invoked by `opentide explorer build` via npx.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codegenTypes } from "../scripts/codegen-types.mjs";
import { isMain } from "../scripts/lib/is-main.mjs";
import {
  collectCorpusValues,
  slimVocabIndex,
} from "../scripts/lib/slim-vocab.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

/** @param {string[]} argv */
function parseArgs(argv) {
  const args = {
    exportsDir: /** @type {string | null} */ (null),
    schemasDir: /** @type {string | null} */ (null),
    output: path.join(process.cwd(), "out", "explorer"),
    basePath: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: opentide-explorer-build build [options]

Options:
  --exports-dir <path>   Directory with explorer.*.json exports
  --schemas-dir <path>   JSON Schema directory for TS codegen
  --output <path>        Static site output directory
  --base-path <path>     Next.js basePath (e.g. /library)
`);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (!value) continue;
    if (arg === "--exports-dir") args.exportsDir = value;
    else if (arg === "--schemas-dir") args.schemasDir = value;
    else if (arg === "--output") args.output = value;
    else if (arg === "--base-path") args.basePath = value;
    else continue;
    i++;
  }

  return args;
}

/** Data files the client reads; the first vocabulary present wins. */
const BUNDLE = "explorer.bundle.json";
/** The slim vocabulary the client loads, and the full index it falls back to. */
const SLIM_VOCAB = "explorer.vocab.json";
const FULL_VOCAB = "vocab.index.json";
const VOCABULARIES = [SLIM_VOCAB, FULL_VOCAB];
/** Written by earlier versions; nothing reads them now. */
const STALE = ["explorer.search.json", "explorer.coverage.json"];

/**
 * Put the exports where `next build` reads them: `<targetDir>/public/data`.
 * @param {string} exportsDir
 * @param {string} targetDir
 */
export function copyExports(exportsDir, targetDir) {
  const dataDir = path.join(targetDir, "public", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const bundleSrc = path.join(exportsDir, BUNDLE);
  if (!fs.existsSync(bundleSrc)) {
    throw new Error(`Missing required export: ${bundleSrc}`);
  }
  fs.copyFileSync(bundleSrc, path.join(dataDir, BUNDLE));

  // public/data holds exactly these exports: a vocabulary left by an earlier build would be
  // served in place of this corpus's.
  for (const file of [...VOCABULARIES, ...STALE]) {
    const src = path.join(exportsDir, file);
    const dest = path.join(dataDir, file);
    if (VOCABULARIES.includes(file) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      fs.rmSync(dest, { force: true });
    }
  }

  // Exports with only the full index (`opentide generate explorer`): derive the slim
  // vocabulary the client loads, and leave the 15 MB index out of the site.
  const slimPath = path.join(dataDir, SLIM_VOCAB);
  const fullPath = path.join(dataDir, FULL_VOCAB);
  if (!fs.existsSync(slimPath) && fs.existsSync(fullPath)) {
    const bundle = JSON.parse(fs.readFileSync(bundleSrc, "utf8"));
    const objects = Object.values(bundle.flatIndex ?? {});
    if (objects.length) {
      const index = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const slim = slimVocabIndex(index, collectCorpusValues(objects));
      fs.writeFileSync(slimPath, JSON.stringify(slim));
      fs.rmSync(fullPath);
    }
  }

  console.log(`Copied exports from ${exportsDir} → ${dataDir}`);
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {string} skip Never copied: the destination itself when it sits inside `src`.
 */
function copyDir(src, dest, skip = dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (s === skip) continue;
    if (entry.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Replace `output` with the static export in `nextOut`. `output` may sit inside `nextOut`
 * (`--output ./out/explorer` from the package root), but it is emptied first, so it must
 * not be the export itself, the package, or a folder that holds the package.
 * @param {string} nextOut
 * @param {string} output
 * @param {string} packageRoot
 */
export function writeOutput(nextOut, output, packageRoot) {
  const target = path.resolve(output);
  const holds = (/** @type {string} */ dir) =>
    dir === target || dir.startsWith(target + path.sep);
  if (holds(path.resolve(packageRoot)) || holds(path.resolve(nextOut))) {
    throw new Error(
      `Refusing to replace ${target}: it holds the explorer package or its export.`,
    );
  }
  fs.rmSync(target, { recursive: true, force: true });
  copyDir(nextOut, target);
}

/** @param {string} name */
function hasPackage(name) {
  try {
    createRequire(import.meta.url).resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "build") {
    console.error("Expected subcommand: build");
    process.exit(1);
  }

  const args = parseArgs(rest);

  if (!args.exportsDir) {
    console.error("--exports-dir is required");
    process.exit(1);
  }

  const exportsDir = path.resolve(args.exportsDir);
  if (!fs.existsSync(exportsDir)) {
    console.error(`Exports directory not found: ${exportsDir}`);
    process.exit(1);
  }

  copyExports(exportsDir, PACKAGE_ROOT);

  const schemasDir =
    args.schemasDir ?? path.join(path.dirname(exportsDir), "schemas");
  await codegenTypes(path.resolve(schemasDir));

  const env = {
    ...process.env,
    NEXT_PUBLIC_BASE_PATH: args.basePath,
  };

  // next.config.ts skips Next's own type check; tsrs is the checker. A git checkout has it
  // (a dev dependency); an npm install of the package does not, and builds unchecked.
  if (hasPackage("tsrs")) {
    console.log("Type-checking with tsrs...");
    execSync("pnpm exec tsrs --noEmit", {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
    });
  }

  console.log("Running next build...");
  execSync("pnpm exec next build", {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
    env,
  });

  const output = path.resolve(args.output);
  writeOutput(path.join(PACKAGE_ROOT, "out"), output, PACKAGE_ROOT);

  console.log(`Static export written to ${output}`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
