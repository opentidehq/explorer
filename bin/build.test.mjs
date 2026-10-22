import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyExports } from "./build.mjs";

const technique = {
  name: "Valid Accounts",
  description: "Adversaries may obtain…",
};
const bundle = {
  version: "0.1.0",
  flatIndex: {
    a: { name: "Threat", threat: { "att&ck": ["T1078"], actors: ["APT29"] } },
  },
  summaries: [],
};
const fullIndex = {
  "att&ck": { T1078: technique },
  actors: { APT29: { name: "APT29" }, FIN7: { name: "FIN7" } },
};

/** @type {string[]} */
const dirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-build-"));
  dirs.push(dir);
  return dir;
}
/**
 * @param {string} dir
 * @param {string} file
 * @param {unknown} data
 */
const write = (dir, file, data) =>
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data));

afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("copyExports", () => {
  it("replaces a vocabulary left by an earlier build with this corpus's", () => {
    const exports = tempDir();
    const target = tempDir();
    write(exports, "explorer.bundle.json", bundle);
    write(exports, "vocab.index.json", fullIndex);
    const data = path.join(target, "public", "data");
    fs.mkdirSync(data, { recursive: true });
    write(data, "explorer.vocab.json", { stale: true });
    write(data, "explorer.search.json", { documents: [] });

    copyExports(exports, target);

    const files = fs.readdirSync(data).toSorted();
    expect(files).toEqual(["explorer.bundle.json", "explorer.vocab.json"]);
    const slim = JSON.parse(
      fs.readFileSync(path.join(data, "explorer.vocab.json"), "utf8"),
    );
    expect(slim.stale).toBeUndefined();
    expect(JSON.stringify(slim)).toContain("Valid Accounts");
  });

  it("copies a slim vocabulary the exports already have", () => {
    const exports = tempDir();
    const target = tempDir();
    write(exports, "explorer.bundle.json", bundle);
    write(exports, "explorer.vocab.json", { version: 1, from: "exports" });

    copyExports(exports, target);

    const data = path.join(target, "public", "data");
    expect(
      JSON.parse(
        fs.readFileSync(path.join(data, "explorer.vocab.json"), "utf8"),
      ),
    ).toEqual({ version: 1, from: "exports" });
    expect(fs.existsSync(path.join(data, "vocab.index.json"))).toBe(false);
  });

  it("requires the bundle", () => {
    expect(() => copyExports(tempDir(), tempDir())).toThrow(
      "Missing required export",
    );
  });
});
