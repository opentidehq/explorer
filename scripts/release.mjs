#!/usr/bin/env node
/**
 * Release helpers.
 *
 *   node scripts/release.mjs check vX.Y.Z   the tag, package.json, and CHANGELOG.md agree
 *   node scripts/release.mjs notes X.Y.Z    print the CHANGELOG.md section for a version
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./lib/is-main.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The body of `## [version] - date`, up to the next version or the link references.
 * @param {string} changelog
 * @param {string} version
 * @returns {string | null}
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(
    (line) => line.startsWith("## ") || /^\[[^\]]+\]: /.test(line),
  );
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

/**
 * @param {string} tag
 * @param {string} version package.json's version
 * @param {string} changelog
 * @returns {string[]} What disagrees.
 */
export function checkRelease(tag, version, changelog) {
  const problems = [];
  if (tag !== `v${version}`) {
    problems.push(`tag ${tag} does not match package.json version ${version}`);
  }
  if (!changelogSection(changelog, version)) {
    problems.push(`CHANGELOG.md has no section for ${version}`);
  }
  return problems;
}

function main() {
  const [command, arg] = process.argv.slice(2);
  const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  if (command === "check" && arg) {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    const problems = checkRelease(arg, version, changelog);
    for (const problem of problems) console.error(`error: ${problem}`);
    if (problems.length) process.exit(1);
    console.log(`${arg} is consistent`);
  } else if (command === "notes" && arg) {
    const section = changelogSection(changelog, arg.replace(/^v/, ""));
    if (section === null) {
      console.error(`CHANGELOG.md has no section for ${arg}`);
      process.exit(1);
    }
    console.log(section);
  } else {
    console.error("usage: release.mjs check vX.Y.Z | notes X.Y.Z");
    process.exit(2);
  }
}

if (isMain(import.meta.url)) main();
