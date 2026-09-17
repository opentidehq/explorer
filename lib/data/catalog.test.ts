import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalogDataUrl } from "@/lib/data/catalog";

describe("catalogDataUrl", () => {
  function withBasePath(value: string | undefined, run: () => void) {
    const previous = process.env.NEXT_PUBLIC_BASE_PATH;
    try {
      if (value === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
      else process.env.NEXT_PUBLIC_BASE_PATH = value;
      run();
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
      else process.env.NEXT_PUBLIC_BASE_PATH = previous;
    }
  }

  it("prefixes NEXT_PUBLIC_BASE_PATH without a trailing slash", () => {
    withBasePath("/library/", () => {
      expect(catalogDataUrl("vocab.index.json")).toBe(
        "/library/data/vocab.index.json",
      );
    });
  });

  it("serves from /data when no base path is set", () => {
    withBasePath(undefined, () => {
      expect(catalogDataUrl("explorer.bundle.json")).toBe(
        "/data/explorer.bundle.json",
      );
    });
  });
});

describe("static pages do not inline catalogue JSON", () => {
  it("keeps ExplorerProvider off route pages", () => {
    const home = readFileSync("app/page.tsx", "utf8");
    const objectPage = readFileSync("app/[type]/[uuid]/page.tsx", "utf8");
    for (const source of [home, objectPage]) {
      expect(source).not.toMatch(/ExplorerProvider/);
      expect(source).not.toMatch(/loadVocabSync/);
      expect(source).not.toMatch(/loadSearchSync/);
    }
    expect(home).not.toMatch(/loadBundleSync/);
  });
});
