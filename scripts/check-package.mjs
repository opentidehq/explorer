#!/usr/bin/env node
/**
 * Proves the npm package works as users get it: packs it, installs the tarball with npm
 * into an empty project, and builds the fixture corpus with the installed CLI. The user's
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
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-package-"));
try {
  const packed = execFileSync(
    npm,
    ["pack", "--silent", "--pack-destination", work],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .at(-1);
  const tarball = path.join(work, /** @type {string} */ (packed));

  const project = path.join(work, "project");
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
    execFileSync(cmd, args, { cwd: project, stdio: "inherit" });
  run(npm, ["install", "--no-audit", "--no-fund", tarball]);
  const manifest = fs.readFileSync(path.join(project, "package.json"), "utf8");

  run(npx, [
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
    if (!fs.existsSync(path.join(out, page)))
      throw new Error(`The build has no ${page}`);
  }
  if (
    fs.readFileSync(path.join(project, "package.json"), "utf8") !== manifest
  ) {
    throw new Error("Building changed the project's package.json");
  }
  console.log(
    `The packed ${packed} installs with npm and builds the fixture corpus.`,
  );
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
