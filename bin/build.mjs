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

function copyExports(exportsDir, targetDir) {
  const dataDir = path.join(targetDir, "public", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const required = ["explorer.bundle.json"];
  const optional = [
    "explorer.coverage.json",
    "explorer.search.json",
    "attack-navigator.json",
    "vocab.att&ck.json",
    "explorer.graph.json",
  ];

  for (const file of required) {
    const src = path.join(exportsDir, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing required export: ${src}`);
    }
    fs.copyFileSync(src, path.join(dataDir, file));
  }

  for (const file of optional) {
    const src = path.join(exportsDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dataDir, file));
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
