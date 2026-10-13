import { describe, expect, it } from "vitest";
import {
  buildSearchDocuments,
  collectFilterOptions,
  createSearchIndex,
  searchCatalog,
} from "@/lib/search/engine";
import { DEFAULT_FILTERS, parseFilterTokens } from "@/lib/search/filters";
import type { ExplorerBundle } from "@/lib/opentide/types";

const T1 = "53389577-fd8d-4ce6-9852-8365ed947c17";
const T2 = "6b175f16-2b61-4116-bd97-de54b02b197e";
const O1 = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
const R1 = "bfae62bb-7ce1-46cd-a131-39803832fa9d";

const bundle = {
  version: "0.2.0",
  generatedAt: "",
  chaining: {},
  models: { threat: {}, objective: {}, signal: {}, rule: {} },
  signals: {},
  flatIndex: {
    [T1]: {
      name: "AAA bypass for unauthorized access",
      threat: {
        description: "LINE VIPER hooks the lina binary",
        killchain: "Defense Evasion",
      },
    },
    [T2]: {
      name: "Password spraying attack",
      threat: { description: "Many accounts, few passwords" },
    },
    [O1]: {
      name: "Detect password spraying",
      objective: { description: "Failed sign-ins across accounts" },
    },
    [R1]: {
      name: "Sign-in failures burst",
      configurations: {
        sentinel: {
          status: "PRODUCTION",
          query: "SigninLogs | where ResultType == 50126",
        },
      },
    },
  },
  summaries: [
    {
      uuid: T1,
      type: "threat",
      name: "AAA bypass for unauthorized access",
      techniques: ["T1556", "T1562.001"],
      actors: ["att&ck::G0007"],
      relatedCount: 0,
      platforms: [],
    },
    {
      uuid: T2,
      type: "threat",
      name: "Password spraying attack",
      techniques: ["T1110.003"],
      actors: [],
      relatedCount: 1,
      platforms: [],
    },
    {
      uuid: O1,
      type: "objective",
      name: "Detect password spraying",
      techniques: ["T1110.003"],
      actors: [],
      relatedCount: 2,
      platforms: [],
    },
    {
      uuid: R1,
      type: "rule",
      name: "Sign-in failures burst",
      techniques: ["T1110.003"],
      actors: [],
      relatedCount: 1,
      platforms: ["sentinel"],
      status: "PRODUCTION",
    },
  ],
  stagingIndex: {
    deployments: { [R1]: { sentinel: "PRODUCTION" } },
    platformSummary: {},
    stagingObjects: [],
    productionObjects: [R1],
  },
} as ExplorerBundle;

const index = createSearchIndex(buildSearchDocuments(bundle));
const search = (input: string) =>
  searchCatalog(index, parseFilterTokens(input), {
    stagingIndex: bundle.stagingIndex,
  }).map((doc) => doc.uuid);

describe("search engine", () => {
  it("returns everything in corpus order without a query", () => {
    expect(searchCatalog(index, DEFAULT_FILTERS).map((d) => d.uuid)).toEqual([
      T1,
      T2,
      O1,
      R1,
    ]);
  });

  it("ranks name matches above body matches and requires every word", () => {
    expect(search("password spraying")).toEqual([T2, O1]);
    expect(search("password")[0]).toBe(T2);
    expect(search("password zebra")).toEqual([]);
  });

  it("searches body text, including rule queries", () => {
    expect(search("lina binary")).toEqual([T1]);
    expect(search("50126")).toEqual([R1]);
  });

  it("matches a technique and its sub-techniques", () => {
    expect(search("technique:T1110")).toEqual([T2, O1, R1]);
    expect(search("T1562")).toEqual([T1]);
  });

  it("applies structured filters", () => {
    expect(search("type:rule")).toEqual([R1]);
    expect(search("platform:sentinel")).toEqual([R1]);
    expect(search("deploy:production")).toEqual([R1]);
    expect(search("actor:G0007")).toEqual([T1]);
    expect(search(`uuid:${O1}`)).toEqual([O1]);
  });

  it("leaves out what != names", () => {
    expect(search("type!=threat")).toEqual([O1, R1]);
    expect(search("technique!=T1110")).toEqual([T1]);
    expect(search("deploy!=production")).toEqual([T1, T2, O1]);
    expect(search("password type!=objective")).toEqual([T2]);
    expect(search(`uuid!=${T1} type:threat`)).toEqual([T2]);
  });

  it("looks up a pasted uuid directly", () => {
    expect(search(T2)).toEqual([T2]);
    expect(search(`${T2} type:rule`)).toEqual([]);
  });

  it("collects filter options from summaries", () => {
    const options = collectFilterOptions(bundle);
    expect(options.platforms).toEqual(["sentinel"]);
    expect(options.techniques).toContain("T1110.003");
    expect(options.types).toEqual(["objective", "rule", "threat"]);
  });
});
