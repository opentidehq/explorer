#!/usr/bin/env node
/**
 * `opentide-explorer build`: a static explorer for a corpus's exports.
 * Runs from a git checkout or from the npm package (`npx @opentide/explorer build`);
 * `opentide-explorer-build build` is the older name for the same command.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../scripts/lib/is-main.mjs";
import {
  collectCorpusValues,
  slimVocabIndex,
} from "../scripts/lib/slim-vocab.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

/**
 * Options after the `build` subcommand. A flag without a value keeps its default; the next
 * flag is never taken as its value.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const args = {
    exportsDir: /** @type {string | null} */ (null),
    schemasDir: /** @type {string | null} */ (null),
    output: path.join(process.cwd(), "out", "explorer"),
    basePath: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: opentide-explorer build [options]

Options:
  --exports-dir <path>   Directory with explorer.*.json exports
  --schemas-dir <path>   JSON Schema directory for TS codegen
  --output <path>        Static site output directory
  --base-path <path>     Next.js basePath (e.g. /library)
`);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) continue;
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

const require = createRequire(import.meta.url);

/** @param {string} name */
function hasPackage(name) {
  try {
    require.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * The path of a package's command-line script, run with this node: no package manager
 * needs to be on PATH, so the build works under npx as well as in a pnpm checkout.
 * @param {string} name
 * @param {string} [bin] Defaults to the package name.
 */
function packageBin(name, bin = name) {
  const manifestPath = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rel =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
  if (!rel) throw new Error(`${name} has no ${bin} command`);
  return path.join(path.dirname(manifestPath), rel);
}

/** What the app needs to build; everything else in the package stays behind. */
const APP_FILES = [
  "app",
  "components",
  "lib",
  "public",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
];

/**
 * Where `next build` runs. Turbopack does not compile sources inside `node_modules`, which
 * is where npm and npx install this package, so an installed package copies the app beside
 * the `node_modules` it was installed into: imports still resolve there. A git checkout
 * builds in place.
 * @param {string} packageRoot
 * @returns {string}
 */
export function appRootFor(packageRoot) {
  const parts = packageRoot.split(path.sep);
  const at = parts.lastIndexOf("node_modules");
  if (at === -1) return packageRoot;

  const installRoot = parts.slice(0, at).join(path.sep) || path.sep;
  const work = path.join(installRoot, ".opentide-explorer");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  for (const name of APP_FILES) {
    fs.cpSync(path.join(packageRoot, name), path.join(work, name), {
      recursive: true,
    });
  }
  // Dependencies npm nested under the package, when versions clashed.
  const nested = path.join(packageRoot, "node_modules");
  if (fs.existsSync(nested)) {
    fs.symlinkSync(nested, path.join(work, "node_modules"), "junction");
  }
  return work;
}

/**
 * Build the static explorer for `args.exportsDir` into `args.output`.
 * @param {ReturnType<typeof parseArgs>} args
 * @returns {Promise<string>} The output directory.
 */
export async function build(args) {
  if (!args.exportsDir) throw new Error("--exports-dir is required");

  const exportsDir = path.resolve(args.exportsDir);
  if (!fs.existsSync(exportsDir)) {
    throw new Error(`Exports directory not found: ${exportsDir}`);
  }

  const appRoot = appRootFor(PACKAGE_ROOT);
  copyExports(exportsDir, appRoot);

  // The schema types only feed the type check. The package ships types generated from the
  // released schemas, and an npm install has neither the generator nor the checker.
  if (hasPackage("json-schema-to-typescript")) {
    const { codegenTypes } = await import("../scripts/codegen-types.mjs");
    const schemasDir =
      args.schemasDir ?? path.join(path.dirname(exportsDir), "schemas");
    await codegenTypes(path.resolve(schemasDir));
  }

  // next.config.ts skips Next's own type check; tsrs is the checker. A git checkout has it
  // (a dev dependency); an npm install of the package does not, and builds unchecked.
  if (hasPackage("tsrs")) {
    console.log("Type-checking with tsrs...");
    execFileSync(process.execPath, [packageBin("tsrs"), "--noEmit"], {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
    });
  }

  console.log("Running next build...");
  execFileSync(process.execPath, [packageBin("next"), "build"], {
    cwd: appRoot,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_BASE_PATH: args.basePath },
  });

  const output = path.resolve(args.output);
  writeOutput(path.join(appRoot, "out"), output, appRoot);
  console.log(`Static export written to ${output}`);
  return output;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "build") {
    console.error("Expected subcommand: build");
    process.exit(1);
  }
  await build(parseArgs(rest));
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
