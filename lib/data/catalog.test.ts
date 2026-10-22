import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalogDataUrl, normalizeExplorerBundle } from "@/lib/data/catalog";
import { buildCatalog } from "@/lib/explorer/catalog";
import { collectFilterOptions } from "@/lib/search/engine";
import type { ExplorerBundle, RawExplorerBundle } from "@/lib/opentide/types";

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

describe("the fixture corpus (OPENTIDE_USE_FIXTURE=1)", () => {
  const fixture = JSON.parse(
    readFileSync("scripts/fixture-bundle.json", "utf8"),
  ) as { "explorer.bundle.json": RawExplorerBundle };
  const raw = fixture["explorer.bundle.json"];

  it("ships the current bundle layout", () => {
    expect(raw.version).toBe("0.2.0");
    expect(raw).not.toHaveProperty("models");
    expect(raw).not.toHaveProperty("signals");
    expect(raw.stagingIndex).toBeDefined();
    for (const summary of raw.summaries) {
      expect(raw.flatIndex[summary.uuid]).toBeDefined();
    }
  });

  it("loads into a catalogue the explorer can show", () => {
    const catalog = buildCatalog(raw, {});

    expect(catalog.overview.counts).toEqual({
      threat: 2,
      objective: 1,
      signal: 1,
      rule: 2,
    });
    expect(catalog.overview.threatsWithRules).toBe(1);
    expect(catalog.overview.chainingLinks).toBe(2);
    expect(catalog.overview.platforms).toEqual([
      { name: "defender_for_endpoint", rules: 1, production: 1 },
      { name: "sentinel", rules: 1, production: 0 },
    ]);
    const { stagingObjects, productionObjects } = raw.stagingIndex!;
    for (const id of [...stagingObjects, ...productionObjects]) {
      expect(catalog.summaries.get(id)?.type).toBe("rule");
    }
  });
});
