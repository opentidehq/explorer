import { describe, expect, it } from "vitest";
import {
  collectRuleTechniques,
  resolveFieldValue,
} from "@/lib/opentide/field-registry";
import { flattenReferences } from "@/lib/opentide/vocab";

describe("flattenReferences", () => {
  it("flattens ObjectReferences public maps", () => {
    expect(
      flattenReferences({
        public: {
          1: "https://example.com/a",
          2: "https://example.com/b",
        },
      }),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });
});

describe("resolveFieldValue", () => {
  it("reads metadata.author for author paths", () => {
    expect(
      resolveFieldValue(
        { metadata: { author: "ec-digit-catch@ec.europa.eu" } },
        "metadata.author",
      ),
    ).toBe("ec-digit-catch@ec.europa.eu");
  });

  it("flattens nested references objects", () => {
    expect(
      resolveFieldValue(
        {
          references: {
            public: { 1: "https://example.com/report" },
          },
        },
        "references",
      ),
    ).toEqual(["https://example.com/report"]);
  });

  it("collects techniques from platform alert blocks", () => {
    expect(
      resolveFieldValue(
        {
          configurations: {
            sentinel: {
              alert: { techniques: ["T1195.002", "T1078"] },
            },
          },
        },
        "techniques",
      ),
    ).toEqual(["T1195.002", "T1078"]);
  });

  it("inherits techniques from summary injection", () => {
    expect(
      collectRuleTechniques({
        _techniques: ["T1059", "T1078"],
      }),
    ).toEqual(["T1059", "T1078"]);
  });
});
