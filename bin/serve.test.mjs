import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  createStaticServer,
  parseServeArgs,
  resolveRequest,
} from "./serve.mjs";

/** @type {string[]} */
const dirs = [];
/** @type {import("node:http").Server[]} */
const servers = [];

/** A static export: a home page, one permalink, data, and a 404 page. */
function exportDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explorer-serve-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, "threats", "abc"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "index.html"), "<p>home</p>");
  fs.writeFileSync(
    path.join(dir, "threats", "abc", "index.html"),
    "<p>abc</p>",
  );
  fs.writeFileSync(path.join(dir, "data", "explorer.bundle.json"), "{}");
  fs.writeFileSync(path.join(dir, "404.html"), "<p>missing</p>");
  return dir;
}

/** @param {string} dir */
async function listen(dir) {
  const server = createStaticServer(dir);
  servers.push(server);
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(null)),
  );
  const address = /** @type {import("node:net").AddressInfo} */ (
    server.address()
  );
  return `http://127.0.0.1:${address.port}`;
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseServeArgs", () => {
  it("defaults to a loopback port and no build to serve", () => {
    const args = parseServeArgs([]);
    expect(args.port).toBe(DEFAULT_PORT);
    expect(args.host).toBe(DEFAULT_HOST);
    expect(args.dir).toBeNull();
    expect(args.exportsDir).toBeNull();
  });

  it("reads the build options beside its own", () => {
    const args = parseServeArgs([
      "--exports-dir",
      "exports",
      "--port",
      "0",
      "--host",
      "0.0.0.0",
      "--dir",
      "site",
    ]);
    expect(args).toMatchObject({
      exportsDir: "exports",
      port: 0,
      host: "0.0.0.0",
      dir: "site",
    });
  });

  it("keeps the default for a flag without a value", () => {
    expect(parseServeArgs(["--port", "--dir", "site"])).toMatchObject({
      port: DEFAULT_PORT,
      dir: "site",
    });
  });

  it("refuses a port that is not one", () => {
    expect(() => parseServeArgs(["--port", "http"])).toThrow(/--port/);
    expect(() => parseServeArgs(["--port", "70000"])).toThrow(/--port/);
  });
});

describe("resolveRequest", () => {
  it("serves a directory's index.html at its slash-terminated URL", () => {
    const dir = exportDir();
    expect(resolveRequest(dir, "/")).toEqual({
      file: path.join(dir, "index.html"),
    });
    expect(resolveRequest(dir, "/threats/abc/")).toEqual({
      file: path.join(dir, "threats", "abc", "index.html"),
    });
  });

  it("redirects a directory URL without its trailing slash", () => {
    expect(resolveRequest(exportDir(), "/threats/abc")).toEqual({
      redirect: "/threats/abc/",
    });
  });

  it("redirects to the path inside the export, never another host", () => {
    expect(resolveRequest(exportDir(), "//evil.com/..%2fdata")).toEqual({
      redirect: "/data/",
    });
  });

  it("serves files as they are", () => {
    const dir = exportDir();
    expect(resolveRequest(dir, "/data/explorer.bundle.json")).toEqual({
      file: path.join(dir, "data", "explorer.bundle.json"),
    });
  });

  it("never leaves the export", () => {
    const dir = exportDir();
    expect(resolveRequest(dir, "/../outside")).toBeNull();
    expect(resolveRequest(dir, "/..%2f..%2fetc%2fpasswd")).toBeNull();
    expect(resolveRequest(dir, "/%00")).toBeNull();
    expect(resolveRequest(dir, "/%E0%A4%A")).toBeNull();
  });

  it("finds nothing for a missing path", () => {
    expect(resolveRequest(exportDir(), "/rules/none/")).toBeNull();
  });
});

describe("createStaticServer", () => {
  it("serves pages with their content type", async () => {
    const base = await listen(exportDir());
    const res = await fetch(`${base}/threats/abc/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<p>abc</p>");
  });

  it("redirects to the trailing slash, keeping the query", async () => {
    const base = await listen(exportDir());
    const res = await fetch(`${base}/threats/abc?view=graph`, {
      redirect: "manual",
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/threats/abc/?view=graph");
  });

  it("answers a missing path with the export's 404 page", async () => {
    const base = await listen(exportDir());
    const res = await fetch(`${base}/rules/none/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("<p>missing</p>");
  });

  it("answers 500 for a file it cannot read, and keeps serving", async () => {
    const dir = exportDir();
    const base = await listen(dir);
    const file = path.join(dir, "data", "explorer.bundle.json");
    fs.chmodSync(file, 0o000);
    try {
      // Root reads any file regardless of mode; the check only means something otherwise.
      const readable = process.getuid?.() === 0;
      const res = await fetch(`${base}/data/explorer.bundle.json`);
      expect(res.status).toBe(readable ? 200 : 500);
    } finally {
      fs.chmodSync(file, 0o644);
    }
    expect((await fetch(`${base}/`)).status).toBe(200);
  });

  it("only reads", async () => {
    const base = await listen(exportDir());
    const res = await fetch(`${base}/`, { method: "POST" });
    expect(res.status).toBe(405);
  });
});
