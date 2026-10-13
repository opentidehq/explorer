#!/usr/bin/env node
/**
 * @opentide/explorer build CLI
 * Invoked by `opentide explorer build` via npx.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
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

function parseArgs(argv) {
  const args = {
    exportsDir: null,
    schemasDir: null,
    output: path.join(process.cwd(), "out", "explorer"),
    basePath: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--exports-dir" && argv[i + 1]) args.exportsDir = argv[++i];
    else if (arg === "--schemas-dir" && argv[i + 1])
      args.schemasDir = argv[++i];
    else if (arg === "--output" && argv[i + 1]) args.output = argv[++i];
    else if (arg === "--base-path" && argv[i + 1]) args.basePath = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: opentide-explorer-build build [options]

Options:
  --exports-dir <path>   Directory with explorer.*.json exports
  --schemas-dir <path>   JSON Schema directory for TS codegen
  --output <path>        Static site output directory
  --base-path <path>     Next.js basePath (e.g. /library)
`);
      process.exit(0);
    }
  }

  return args;
}

/** Data files the client reads; the first vocabulary present wins. */
const BUNDLE = "explorer.bundle.json";
const VOCABULARIES = ["explorer.vocab.json", "vocab.index.json"];
/** Written by earlier versions; nothing reads them now. */
const STALE = ["explorer.search.json", "explorer.coverage.json"];

/** Put the exports where `next build` reads them: `<targetDir>/public/data`. */
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
  const slimPath = path.join(dataDir, VOCABULARIES[0]);
  const fullPath = path.join(dataDir, VOCABULARIES[1]);
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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
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

  console.log("Running next build...");
  execSync("pnpm exec next build", {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
    env,
  });

  const nextOut = path.join(PACKAGE_ROOT, "out");
  const output = path.resolve(args.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  if (fs.existsSync(output)) {
    fs.rmSync(output, { recursive: true });
  }
  copyDir(nextOut, output);

  console.log(`Static export written to ${output}`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
