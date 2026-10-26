import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRootFor, copyExports, parseArgs, writeOutput } from "./build.mjs";

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

describe("parseArgs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaults = () => ({
    exportsDir: null,
    schemasDir: null,
    output: path.join(process.cwd(), "out", "explorer"),
    basePath: "",
  });

  it("defaults every option", () => {
    expect(parseArgs([])).toEqual(defaults());
  });

  it("reads each flag's value", () => {
    expect(
      parseArgs([
        "--exports-dir",
        "exports",
        "--schemas-dir",
        "schemas",
        "--output",
        "site",
        "--base-path",
        "/library",
      ]),
    ).toEqual({
      exportsDir: "exports",
      schemasDir: "schemas",
      output: "site",
      basePath: "/library",
    });
  });

  it("takes each flag on its own, the last one winning", () => {
    expect(parseArgs(["--output", "a", "--output", "b"]).output).toBe("b");
    expect(parseArgs(["--base-path", "/x"])).toEqual({
      ...defaults(),
      basePath: "/x",
    });
    expect(parseArgs(["--schemas-dir", "s"])).toEqual({
      ...defaults(),
      schemasDir: "s",
    });
  });

  it("keeps the default for a flag without a value", () => {
    expect(parseArgs(["--exports-dir"])).toEqual(defaults());
    expect(parseArgs(["--output", ""]).output).toBe(defaults().output);
    // The next flag is not the value: both apply.
    expect(parseArgs(["--exports-dir", "--output", "site"])).toEqual({
      ...defaults(),
      output: "site",
    });
  });

  it("skips unknown flags without eating the next one", () => {
    expect(parseArgs(["--verbose", "--exports-dir", "exports"])).toEqual({
      ...defaults(),
      exportsDir: "exports",
    });
    expect(parseArgs(["stray", "--output", "site"]).output).toBe("site");
  });

  for (const flag of ["--help", "-h"]) {
    it(`prints usage and exits for ${flag}`, () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`exit ${code}`);
      });

      expect(() => parseArgs(["--output", "site", flag])).toThrow("exit 0");
      // Not taken as an unknown flag's value.
      expect(() => parseArgs(["--verbose", flag])).toThrow("exit 0");
      expect(exit).toHaveBeenCalledWith(0);
      expect(log.mock.calls[0]?.[0]).toMatch(/^Usage: opentide-explorer build/);
      for (const option of [
        "--exports-dir",
        "--schemas-dir",
        "--output",
        "--base-path",
      ]) {
        expect(log.mock.calls[0]?.[0]).toContain(option);
      }
    });
  }
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

describe("writeOutput", () => {
  /** A package root with a static export in `out/`. */
  function packageWithExport() {
    const root = tempDir();
    const out = path.join(root, "out");
    fs.mkdirSync(path.join(out, "threats"), { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), "<html>");
    fs.writeFileSync(path.join(out, "threats", "index.html"), "<html>");
    return { root, out };
  }

  it("replaces the output with the export", () => {
    const { root, out } = packageWithExport();
    const output = path.join(tempDir(), "site");
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, "old.html"), "stale");

    writeOutput(out, output, root);

    expect(fs.readdirSync(output).toSorted()).toEqual([
      "index.html",
      "threats",
    ]);
  });

  it("writes an output inside the export without copying it into itself", () => {
    const { root, out } = packageWithExport();
    const output = path.join(out, "explorer");

    writeOutput(out, output, root);

    expect(fs.readdirSync(output).toSorted()).toEqual([
      "index.html",
      "threats",
    ]);
    expect(fs.existsSync(path.join(output, "explorer"))).toBe(false);
  });

  it("refuses an output that holds the package or the export", () => {
    const { root, out } = packageWithExport();
    for (const output of [root, path.dirname(root), out]) {
      expect(() => writeOutput(out, output, root)).toThrow("Refusing");
    }
    expect(fs.existsSync(path.join(out, "index.html"))).toBe(true);
  });

  it("refuses an output that holds any folder it must keep, such as the exports", () => {
    const { root, out } = packageWithExport();
    const corpus = tempDir();
    const exportsDir = path.join(corpus, ".opentide", "exports");
    fs.mkdirSync(exportsDir, { recursive: true });
    expect(() =>
      writeOutput(out, path.join(corpus, ".opentide"), [root, exportsDir]),
    ).toThrow("Refusing");
    expect(fs.existsSync(exportsDir)).toBe(true);
  });
});

describe("appRootFor", () => {
  const appFiles = ["app", "components", "lib", "public"];
  const configFiles = ["next.config.ts", "postcss.config.mjs", "tsconfig.json"];

  /** @param {string} root */
  function fakePackage(root) {
    for (const dir of appFiles) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, "file.txt"), dir);
    }
    for (const file of configFiles)
      fs.writeFileSync(path.join(root, file), file);
    fs.mkdirSync(path.join(root, "bin"));
    return root;
  }

  it("builds a git checkout in place", () => {
    const root = fakePackage(tempDir());
    expect(appRootFor(root)).toBe(root);
  });

  it("copies an installed package's app beside its node_modules", () => {
    const install = tempDir();
    const pkg = fakePackage(
      path.join(install, "node_modules", "@opentide", "explorer"),
    );
    const work = appRootFor(pkg);
    expect(work).toBe(path.join(install, ".opentide-explorer"));
    for (const dir of appFiles) {
      expect(fs.readFileSync(path.join(work, dir, "file.txt"), "utf8")).toBe(
        dir,
      );
    }
    for (const file of configFiles)
      expect(fs.existsSync(path.join(work, file))).toBe(true);
    expect(fs.existsSync(path.join(work, "bin"))).toBe(false);
  });

  it("stages outside pnpm's store and links the package's dependencies", () => {
    const install = tempDir();
    const store = path.join(
      install,
      "node_modules",
      ".pnpm",
      "@opentide+explorer@0.5.0",
      "node_modules",
    );
    const pkg = fakePackage(path.join(store, "@opentide", "explorer"));
    fs.mkdirSync(path.join(store, "next"));
    fs.mkdirSync(path.join(store, "@types", "react"), { recursive: true });
    const work = appRootFor(pkg);
    expect(work).toBe(path.join(install, ".opentide-explorer"));
    expect(fs.realpathSync(path.join(work, "node_modules", "next"))).toBe(
      fs.realpathSync(path.join(store, "next")),
    );
    expect(
      fs.existsSync(path.join(work, "node_modules", "@types", "react")),
    ).toBe(true);
  });

  it("prefers dependencies npm nested under the package", () => {
    const install = tempDir();
    const pkg = fakePackage(
      path.join(install, "node_modules", "@opentide", "explorer"),
    );
    fs.mkdirSync(path.join(install, "node_modules", "next"));
    fs.mkdirSync(path.join(pkg, "node_modules", "next"), { recursive: true });
    const work = appRootFor(pkg);
    expect(fs.realpathSync(path.join(work, "node_modules", "next"))).toBe(
      fs.realpathSync(path.join(pkg, "node_modules", "next")),
    );
  });

  it("starts each build from a fresh copy", () => {
    const install = tempDir();
    const pkg = fakePackage(
      path.join(install, "node_modules", "@opentide", "explorer"),
    );
    const stale = path.join(
      install,
      ".opentide-explorer",
      "public",
      "data",
      "old.json",
    );
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, "{}");
    appRootFor(pkg);
    expect(fs.existsSync(stale)).toBe(false);
  });
});
