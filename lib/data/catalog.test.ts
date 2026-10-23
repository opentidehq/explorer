import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  catalogDataUrl,
  loadCatalog,
  normalizeExplorerBundle,
} from "@/lib/data/catalog";
import { buildCatalog } from "@/lib/explorer/catalog";
import { collectFilterOptions } from "@/lib/search/engine";
import type {
  ExplorerBundle,
  ObjectType,
  RawExplorerBundle,
} from "@/lib/opentide/types";
import type { SlimVocab, VocabIndex } from "@/lib/opentide/vocab";

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

  /** A 0.2 bundle: each object once, in `flatIndex`. */
  function slimBundle(): RawExplorerBundle {
    const summary = (uuid: string, type: ObjectType) => ({
      uuid,
      type,
      name: uuid,
      techniques: [],
      actors: [],
      relatedCount: 0,
      platforms: [],
    });
    return {
      version: "0.2.0",
      generatedAt: "",
      flatIndex: {
        t1: { name: "Threat" },
        o1: { name: "Objective" },
        s1: { name: "Signal", parent: "o1" },
        r1: { name: "Rule", detection_model: "s1" },
      },
      chaining: { t1: { "sequence::preceeds": ["t2"] } },
      summaries: [
        summary("t1", "threat"),
        summary("o1", "objective"),
        summary("s1", "signal"),
        summary("r1", "rule"),
      ],
    };
  }

  it("rebuilds models and signals from flatIndex for the 0.2 layout", () => {
    const raw = slimBundle();
    const bundle = normalizeExplorerBundle(raw);

    expect(bundle.models).toEqual({
      threat: { t1: raw.flatIndex.t1 },
      objective: { o1: raw.flatIndex.o1 },
      signal: { s1: raw.flatIndex.s1 },
      rule: { r1: raw.flatIndex.r1 },
    });
    // The same bodies, not copies: flatIndex stays the one source.
    expect(bundle.models.rule.r1).toBe(raw.flatIndex.r1);
    expect(bundle.signals).toEqual({ s1: raw.flatIndex.s1 });
    expect(bundle.chaining).toBe(raw.chaining);
  });

  it("rebuilds partial models instead of keeping the types they have", () => {
    const raw = slimBundle();
    raw.models = { threat: { t1: raw.flatIndex.t1! }, signal: {} };
    const bundle = normalizeExplorerBundle(raw);

    expect(Object.keys(bundle.models)).toEqual([
      "threat",
      "objective",
      "signal",
      "rule",
    ]);
    expect(bundle.models.objective).toEqual({ o1: raw.flatIndex.o1 });
    expect(bundle.models.rule).toEqual({ r1: raw.flatIndex.r1 });
  });

  it("keeps complete 0.1 models and signals as shipped", () => {
    const raw = slimBundle();
    const models = { threat: {}, objective: {}, signal: {}, rule: {} };
    const signals = { legacy: { name: "Shipped signal" } };
    const bundle = normalizeExplorerBundle({ ...raw, models, signals });

    expect(bundle.models).toBe(models);
    expect(bundle.signals).toBe(signals);
  });

  it("indexes only summaries with a known type and a body", () => {
    const raw = slimBundle();
    raw.summaries.push(
      {
        ...raw.summaries[0]!,
        uuid: "a1",
        type: "actor" as ObjectType,
      },
      { ...raw.summaries[0]!, uuid: "missing" },
    );
    raw.flatIndex.a1 = { name: "Actor" };

    const bundle = normalizeExplorerBundle(raw);

    expect(Object.keys(bundle.models)).toEqual([
      "threat",
      "objective",
      "signal",
      "rule",
    ]);
    expect(Object.keys(bundle.models.threat)).toEqual(["t1"]);
    // Summaries pass through: filtering what the views list is not this function's job.
    expect(bundle.summaries).toHaveLength(6);
  });

  it("fills what an export may leave out", () => {
    const bundle = normalizeExplorerBundle({
      version: "0.2.0",
      generatedAt: "",
      summaries: [
        {
          uuid: "t1",
          type: "threat",
          name: "Threat",
          techniques: ["T1078", 7, null],
          actors: "APT29",
          relatedCount: 0,
        },
      ],
    } as unknown as RawExplorerBundle);

    expect(bundle.flatIndex).toEqual({});
    expect(bundle.chaining).toEqual({});
    expect(bundle.signals).toEqual({});
    expect(bundle.summaries[0]).toMatchObject({
      techniques: ["T1078"],
      actors: [],
      platforms: [],
    });
    expect(
      normalizeExplorerBundle({} as unknown as RawExplorerBundle).summaries,
    ).toEqual([]);
  });
});

describe("loadCatalog", () => {
  const raw: RawExplorerBundle = {
    version: "0.2.0",
    generatedAt: "",
    flatIndex: { t1: { name: "Threat" } },
    chaining: {},
    summaries: [
      {
        uuid: "t1",
        type: "threat",
        name: "Threat",
        techniques: [],
        actors: [],
        relatedCount: 0,
        platforms: [],
      },
    ],
  };
  const fullVocab: VocabIndex = { actors: { APT29: { name: "APT29" } } };
  const slimVocab: SlimVocab = {
    version: 1,
    vocabs: {
      "att&ck": {
        terms: [{ name: "Valid Accounts" }],
        keys: { T1078: 0, t1078: 0 },
      },
    },
  };

  /**
   * Serve `files` from /data; anything else is a 404 with a JSON body (as some hosts send),
   * which must not be read as data. A `null` file fails the request.
   */
  function serve(files: Record<string, unknown>) {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async (url) => {
      const name = url.replace(/^.*\/data\//, "");
      if (!(name in files)) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      const body = files[name];
      if (body === null) throw new TypeError("Failed to fetch");
      return new Response(
        typeof body === "string" ? body : JSON.stringify(body),
      );
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the bundle and the slim vocabulary, reporting each stage", async () => {
    const fetch = serve({
      "explorer.bundle.json": raw,
      "explorer.vocab.json": slimVocab,
      "vocab.index.json": fullVocab,
    });
    const stages: string[] = [];

    const { bundle, vocabIndex } = await loadCatalog((stage) =>
      stages.push(stage),
    );

    expect(stages).toEqual(["fetching", "indexing"]);
    expect(bundle.models.threat.t1).toEqual({ name: "Threat" });
    expect(vocabIndex["att&ck"]?.T1078?.name).toBe("Valid Accounts");
    expect(vocabIndex["att&ck"]?.t1078).toBe(vocabIndex["att&ck"]?.T1078);
    // The 15 MB index is only the fallback.
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain(
      "/data/vocab.index.json",
    );
  });

  it("falls back to the full vocabulary without a slim one", async () => {
    serve({ "explorer.bundle.json": raw, "vocab.index.json": fullVocab });

    expect((await loadCatalog()).vocabIndex).toEqual(fullVocab);
  });

  it("falls back to the full vocabulary when the slim file is not slim", async () => {
    serve({
      "explorer.bundle.json": raw,
      "explorer.vocab.json": { actors: {} },
      "vocab.index.json": fullVocab,
    });

    expect((await loadCatalog()).vocabIndex).toEqual(fullVocab);
  });

  it("loads with an empty vocabulary when neither is available", async () => {
    serve({
      "explorer.bundle.json": raw,
      "explorer.vocab.json": null,
      "vocab.index.json": "{ not json",
    });

    expect((await loadCatalog()).vocabIndex).toEqual({});
  });

  it("fails when the bundle is unavailable, before indexing", async () => {
    const stages: string[] = [];

    serve({ "explorer.vocab.json": slimVocab });
    await expect(loadCatalog((stage) => stages.push(stage))).rejects.toThrow(
      "Catalogue bundle is unavailable",
    );
    serve({ "explorer.bundle.json": null });
    await expect(loadCatalog()).rejects.toThrow(
      "Catalogue bundle is unavailable",
    );
    expect(stages).toEqual(["fetching"]);
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
