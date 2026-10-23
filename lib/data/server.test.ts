import { describe, expect, it } from "vitest";
import { objectRouteParams, readBundle } from "@/lib/data/server";
import type { RawExplorerBundle } from "@/lib/opentide/types";

const OBJECTIVE = "00000000-0000-4000-8000-0000000000a1";
const SIGNAL = "00000000-0000-4000-8000-0000000000a2";

/** An export that leaves its objective's signals embedded, as `opentide generate` may. */
const raw = {
  version: "0.2.0",
  generatedAt: "",
  flatIndex: {
    [OBJECTIVE]: {
      name: "Detect spraying",
      metadata: { uuid: OBJECTIVE, schema: "objective::1.0" },
      objective: { signals: [{ uuid: SIGNAL, name: "Failed sign-ins" }] },
    },
  },
  summaries: [
    {
      uuid: OBJECTIVE,
      type: "objective",
      name: "Detect spraying",
      techniques: [],
      relatedCount: 0,
    },
  ],
} as unknown as RawExplorerBundle;

describe("objectRouteParams", () => {
  it("has a permalink for every signal the client promotes", () => {
    expect(objectRouteParams(readBundle(raw))).toEqual([
      { type: "objectives", uuid: OBJECTIVE },
      { type: "signals", uuid: SIGNAL },
    ]);
  });
});
