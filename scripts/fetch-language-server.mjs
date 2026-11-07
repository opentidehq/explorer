#!/usr/bin/env node
/**
 * Puts the opentide language server where the browser loads it: `public/lsp/`.
 *
 * The server is `opentide-wasm` from opentidehq/language-server, built for
 * `wasm32-unknown-unknown` with wasm-bindgen (`--target web`). Each language-server release
 * ships it as `opentide-wasm-web-v<version>.zip`. This script downloads the release pinned in
 * `scripts/language-server.json`, checks it against the pinned sha256, and unpacks the glue,
 * the module and their licences. `OPENTIDE_LSP_WASM_DIR` copies a local build instead (a
 * directory holding `opentide_wasm.js` and `opentide_wasm_bg.wasm`, as
 * `wasm-bindgen --target web` writes them).
 *
 *   node scripts/fetch-language-server.mjs [--optional] [--dir <app root>]
 *
 * `--optional` turns a failure into a warning: the explorer builds without the language
 * server, and its code panels fall back to the regex highlighter.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./lib/is-main.mjs";
import { readZip } from "./lib/zip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** The pinned release: `{ version, sha256 }`. */
export const PIN = JSON.parse(
  fs.readFileSync(path.join(__dirname, "language-server.json"), "utf8"),
);

/** The files the browser loads; the rest of what is kept is licences. */
export const GLUE = "opentide_wasm.js";
export const MODULE = "opentide_wasm_bg.wasm";
/** What `public/lsp/` was filled from, so an unchanged pin skips the download. */
const STAMP = ".source";

/** @param {{ version: string }} pin */
export function releaseUrl(pin) {
  const tag = `v${pin.version}`;
  return `https://github.com/opentidehq/language-server/releases/download/${tag}/opentide-wasm-web-${tag}.zip`;
}

/**
 * Whether a zip entry is one to keep, and where: the glue, the module, and the licences
 * (`LICENSE`, `NOTICE`, `licenses/**`). Type declarations and anything that would land
 * outside the target are dropped.
 * @param {string} name
 * @returns {string | null} The relative path to write.
 */
export function keptEntry(name) {
  const normal = path.posix.normalize(name.replace(/\\/g, "/"));
  if (normal.startsWith("../") || normal.startsWith("/") || normal === "..") {
    return null;
  }
  if (normal === GLUE || normal === MODULE) return normal;
  if (normal === "LICENSE" || normal === "NOTICE") return normal;
  if (normal.startsWith("licenses/")) return normal;
  return null;
}

/**
 * Unpack the release zip into `dir`, replacing what is there.
 * @param {Buffer} zip
 * @param {string} dir
 * @param {string} stamp
 */
export function unpack(zip, dir, stamp) {
  const files = readZip(zip)
    .map((file) => ({ ...file, rel: keptEntry(file.name) }))
    .filter((file) => file.rel !== null);
  const names = new Set(files.map((file) => file.rel));
  if (!names.has(GLUE) || !names.has(MODULE)) {
    throw new Error(`the archive holds no ${GLUE} and ${MODULE}`);
  }
  const staging = `${dir}.partial`;
  fs.rmSync(staging, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(staging, /** @type {string} */ (file.rel));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
  fs.writeFileSync(path.join(staging, STAMP), stamp);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(staging, dir);
}

/**
 * Copy a local wasm-bindgen `--target web` build into `dir`.
 * @param {string} source
 * @param {string} dir
 */
export function copyLocal(source, dir) {
  for (const name of [GLUE, MODULE]) {
    if (!fs.existsSync(path.join(source, name))) {
      throw new Error(`${source} holds no ${name}`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const name of [GLUE, MODULE, "LICENSE", "NOTICE"]) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, name));
  }
  const licenses = path.join(source, "licenses");
  if (fs.existsSync(licenses)) {
    fs.cpSync(licenses, path.join(dir, "licenses"), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, STAMP), `local ${path.resolve(source)}`);
}

/**
 * Fill `<appRoot>/public/lsp` with the pinned language server, unless it holds it already.
 * @param {{ appRoot?: string, pin?: { version: string, sha256: string }, localDir?: string, download?: (url: string) => Promise<Buffer> }} [options]
 * @returns {Promise<string>} What it holds, e.g. `opentide-wasm-web v0.11.0`.
 */
export async function fetchLanguageServer(options = {}) {
  const appRoot = options.appRoot ?? ROOT;
  const pin = options.pin ?? PIN;
  const localDir = options.localDir ?? process.env.OPENTIDE_LSP_WASM_DIR;
  const dir = path.join(appRoot, "public", "lsp");

  if (localDir) {
    copyLocal(localDir, dir);
    return `local build from ${localDir}`;
  }

  const stamp = `opentide-wasm-web v${pin.version} ${pin.sha256}`;
  const stampPath = path.join(dir, STAMP);
  if (
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, "utf8") === stamp &&
    fs.existsSync(path.join(dir, GLUE)) &&
    fs.existsSync(path.join(dir, MODULE))
  ) {
    return `opentide-wasm-web v${pin.version} (already present)`;
  }

  const url = releaseUrl(pin);
  const zip = await (options.download ?? download)(url);
  const digest = crypto.createHash("sha256").update(zip).digest("hex");
  if (digest !== pin.sha256) {
    throw new Error(
      `${url}: sha256 ${digest} does not match the pinned ${pin.sha256}`,
    );
  }
  unpack(zip, dir, stamp);
  return `opentide-wasm-web v${pin.version}`;
}

/** @param {string} url */
async function download(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const argv = process.argv.slice(2);
  const optional = argv.includes("--optional");
  const dirAt = argv.indexOf("--dir");
  const appRoot = dirAt !== -1 && argv[dirAt + 1] ? argv[dirAt + 1] : ROOT;
  try {
    const held = await fetchLanguageServer({ appRoot });
    console.log(`Language server: ${held} → public/lsp`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!optional) throw error;
    console.warn(
      `Language server not fetched (${message}); the explorer builds without it.`,
    );
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
