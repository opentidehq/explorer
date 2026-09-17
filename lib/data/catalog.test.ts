import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalogDataUrl, normalizeExplorerBundle } from "@/lib/data/catalog";
import { collectFilterOptions } from "@/lib/search/orama";
import type { ExplorerBundle } from "@/lib/opentide/types";

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

describe("normalizeExplorerBundle", () => {
  it("fills missing actors so filter collection does not throw", () => {
    const bundle = normalizeExplorerBundle({
      version: "1",
      generatedAt: "",
      models: { threat: {}, objective: {}, signal: {}, rule: {} },
      flatIndex: {},
      chaining: {},
      signals: {},
      summaries: [
        {
          uuid: "t1",
          type: "threat",
          name: "Shai-Hulud",
          techniques: ["T1195.001"],
          relatedCount: 0,
          platforms: ["npm"],
        } as ExplorerBundle["summaries"][number],
      ],
    });

    expect(bundle.summaries[0]?.actors).toEqual([]);
    expect(() => collectFilterOptions(bundle)).not.toThrow();
    expect(collectFilterOptions(bundle).techniques).toEqual(["T1195.001"]);
  });
});
