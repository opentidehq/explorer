#!/usr/bin/env node
/**
 * Proves the npm package works as users get it: packs it, installs the tarball into an
 * empty project with npm, and with pnpm when it is on PATH (its store puts the package
 * deeper inside node_modules), and builds the fixture corpus with the installed CLI. The
 * project must come out with nothing changed but the build output.
 *
 *   node scripts/check-package.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Node refuses to spawn a Windows .cmd without a shell; the arguments are fixed paths.
const shell = process.platform === "win32";

/** @param {string} cmd */
function available(cmd) {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore", shell });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install the tarball into a fresh project with `manager` and build the fixture corpus.
 * @param {string} work
 * @param {string} tarball
 * @param {"npm" | "pnpm"} manager
 */
function installAndBuild(work, tarball, manager) {
  const project = path.join(work, `project-${manager}`);
  const exportsDir = path.join(project, ".opentide", "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  const fixture = JSON.parse(
    fs.readFileSync(path.join(ROOT, "scripts", "fixture-bundle.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(exportsDir, "explorer.bundle.json"),
    JSON.stringify(fixture["explorer.bundle.json"]),
  );
  fs.writeFileSync(
    path.join(project, "package.json"),
    '{"name":"project","private":true}\n',
  );

  const run = (/** @type {string} */ cmd, /** @type {string[]} */ args) =>
    execFileSync(cmd, args, { cwd: project, stdio: "inherit", shell });
  if (manager === "npm")
    run("npm", ["install", "--no-audit", "--no-fund", tarball]);
  else run("pnpm", ["add", tarball]);
  const manifest = fs.readFileSync(path.join(project, "package.json"), "utf8");

  const [cli, ...prefix] = manager === "npm" ? ["npx"] : ["pnpm", "exec"];
  run(/** @type {string} */ (cli), [
    ...prefix,
    "opentide-explorer",
    "build",
    "--exports-dir",
    ".opentide/exports",
  ]);

  const out = path.join(project, "out", "explorer");
  for (const page of [
    "index.html",
    path.join("data", "explorer.bundle.json"),
  ]) {
    if (!fs.existsSync(path.join(out, page))) {
      throw new Error(`${manager}: the build has no ${page}`);
    }
  }
  if (
    fs.readFileSync(path.join(project, "package.json"), "utf8") !== manifest
  ) {
    throw new Error(`${manager}: building changed the project's package.json`);
  }
  console.log(
    `Installed with ${manager}, the package builds the fixture corpus.`,
  );
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-package-"));
try {
  const packed = execFileSync(
    "npm",
    ["pack", "--silent", "--pack-destination", work],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell,
    },
  )
    .trim()
    .split("\n")
    .at(-1);
  const tarball = path.join(work, /** @type {string} */ (packed));

  // `npx @opentide/explorer` names no command: npx runs the package's only bin, or the
  // one named after it, and fails when it cannot tell which.
  // A relative path: npx runs an absolute one as a command instead of installing it.
  const version = execFileSync("npx", ["--yes", `./${packed}`, "--version"], {
    cwd: work,
    encoding: "utf8",
    shell,
  }).trim();
  console.log(`npx <package> runs the CLI (${version}).`);

  installAndBuild(work, tarball, "npm");
  if (available("pnpm")) installAndBuild(work, tarball, "pnpm");
  else console.warn("pnpm is not on PATH: skipped the pnpm install.");
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
