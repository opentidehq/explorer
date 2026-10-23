import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/lib/explorer/catalog";
import { searchCatalog } from "@/lib/search/engine";
import { parseFilterTokens } from "@/lib/search/filters";
import type { RawExplorerBundle } from "@/lib/opentide/types";

const THREAT = "00000000-0000-4000-8000-0000000000b1";
const OBJECTIVE = "00000000-0000-4000-8000-0000000000b2";
const SIGNAL = "00000000-0000-4000-8000-0000000000b3";

/** A bundle whose signal summary carries no techniques, as exports before 0.2 wrote it. */
const raw = {
  version: "0.2.0",
  generatedAt: "",
  flatIndex: {
    [THREAT]: {
      name: "Password spraying",
      metadata: { uuid: THREAT, schema: "threat::1.0" },
      threat: { mitre_attack: ["T1110.003"] },
    },
    [OBJECTIVE]: {
      name: "Detect spraying",
      metadata: { uuid: OBJECTIVE, schema: "objective::1.0" },
      objective: { threats: [THREAT] },
    },
    [SIGNAL]: {
      name: "Failed sign-ins",
      metadata: { uuid: SIGNAL, schema: "signal::1.0" },
      _objective: OBJECTIVE,
    },
  },
  summaries: [
    { uuid: THREAT, type: "threat", name: "Password spraying" },
    { uuid: OBJECTIVE, type: "objective", name: "Detect spraying" },
    { uuid: SIGNAL, type: "signal", name: "Failed sign-ins" },
  ].map((summary) => ({ ...summary, techniques: [], relatedCount: 0 })),
} as unknown as RawExplorerBundle;

describe("catalogue search", () => {
  it("matches a technique wherever the ATT&CK matrix counts it", () => {
    const catalog = buildCatalog(raw, {});
    const hits = searchCatalog(
      catalog.search,
      parseFilterTokens("technique:T1110.003"),
    ).map((doc) => doc.uuid);
    expect(hits).toEqual([THREAT, OBJECTIVE, SIGNAL]);
  });
});
