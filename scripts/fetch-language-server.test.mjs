import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  GLUE,
  MODULE,
  PIN,
  fetchLanguageServer,
  keptEntry,
  releaseUrl,
} from "./fetch-language-server.mjs";
import { readZip } from "./lib/zip.mjs";

/**
 * A zip with the given files, deflated, as `zip -r` writes one.
 * @param {Record<string, string>} files
 */
function makeZip(files) {
  /** @type {Buffer[]} */
  const locals = [];
  /** @type {Buffer[]} */
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const deflated = zlib.deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, deflated);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + deflated.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const RELEASE = {
  [GLUE]: "export default async function init() {}",
  [MODULE]: "\0asm",
  "opentide_wasm.d.ts": "export {};",
  LICENSE: "EUPL",
  NOTICE: "notice",
  "licenses/wasi-libc/LICENSE": "MIT",
  "../escape.txt": "no",
};

/** @type {string[]} */
const dirs = [];
function tempApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-lsp-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("readZip", () => {
  it("reads deflated entries", () => {
    const files = readZip(makeZip({ "a.txt": "hello", "b/c.txt": "world" }));
    expect(files.map((f) => [f.name, f.data.toString()])).toEqual([
      ["a.txt", "hello"],
      ["b/c.txt", "world"],
    ]);
  });

  it("refuses what is not a zip", () => {
    expect(() => readZip(Buffer.from("not a zip at all, no"))).toThrow(
      "not a zip",
    );
  });
});

describe("keptEntry", () => {
  it("keeps the glue, the module and the licences, and nothing outside", () => {
    expect(keptEntry(GLUE)).toBe(GLUE);
    expect(keptEntry(MODULE)).toBe(MODULE);
    expect(keptEntry("licenses/x/LICENSE")).toBe("licenses/x/LICENSE");
    expect(keptEntry("opentide_wasm.d.ts")).toBeNull();
    expect(keptEntry("../escape.txt")).toBeNull();
    expect(keptEntry("/etc/passwd")).toBeNull();
  });
});

describe("fetchLanguageServer", () => {
  const zip = makeZip(RELEASE);
  const pin = {
    version: "0.0.1",
    sha256: crypto.createHash("sha256").update(zip).digest("hex"),
  };

  it("pins a release the language server publishes", () => {
    expect(PIN.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(PIN.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(releaseUrl(PIN)).toBe(
      `https://github.com/opentidehq/language-server/releases/download/v${PIN.version}/opentide-wasm-web-v${PIN.version}.zip`,
    );
  });

  it("unpacks a verified release once", async () => {
    const appRoot = tempApp();
    let downloads = 0;
    const download = async () => {
      downloads += 1;
      return zip;
    };
    await fetchLanguageServer({ appRoot, pin, download, localDir: "" });
    const lsp = path.join(appRoot, "public", "lsp");
    expect(fs.readFileSync(path.join(lsp, GLUE), "utf8")).toBe(RELEASE[GLUE]);
    expect(fs.existsSync(path.join(lsp, "licenses/wasi-libc/LICENSE"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(lsp, "opentide_wasm.d.ts"))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, "public", "escape.txt"))).toBe(
      false,
    );

    const again = await fetchLanguageServer({
      appRoot,
      pin,
      download,
      localDir: "",
    });
    expect(again).toContain("already present");
    expect(downloads).toBe(1);
  });

  it("refuses an archive whose digest is not the pinned one", async () => {
    const appRoot = tempApp();
    await expect(
      fetchLanguageServer({
        appRoot,
        pin: { ...pin, sha256: "0".repeat(64) },
        download: async () => zip,
        localDir: "",
      }),
    ).rejects.toThrow("does not match the pinned");
    expect(fs.existsSync(path.join(appRoot, "public", "lsp"))).toBe(false);
  });

  it("copies a local build instead", async () => {
    const appRoot = tempApp();
    const local = tempApp();
    fs.writeFileSync(path.join(local, GLUE), "glue");
    fs.writeFileSync(path.join(local, MODULE), "wasm");
    const held = await fetchLanguageServer({
      appRoot,
      pin,
      localDir: local,
      download: async () => {
        throw new Error("no download");
      },
    });
    expect(held).toContain("local build");
    expect(
      fs.readFileSync(path.join(appRoot, "public", "lsp", MODULE), "utf8"),
    ).toBe("wasm");
  });
});
