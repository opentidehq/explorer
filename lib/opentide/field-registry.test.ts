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

  it("projects ThreatActor names from threat.actors.name", () => {
    expect(
      resolveFieldValue(
        {
          threat: {
            actors: [
              { name: "att&ck::G0125" },
              { name: "misp::4f05d6c1-aaaa-bbbb-cccc-ddddeeeeffff" },
            ],
          },
        },
        "threat.actors.name",
      ),
    ).toEqual(["att&ck::G0125", "misp::4f05d6c1-aaaa-bbbb-cccc-ddddeeeeffff"]);
  });

  it("reads string threat.actors through the .name pin", () => {
    expect(
      resolveFieldValue(
        {
          threat: {
            actors: ["att&ck::G0007", "att&ck::G0016"],
          },
        },
        "threat.actors.name",
      ),
    ).toEqual(["att&ck::G0007", "att&ck::G0016"]);
  });

  it("reads id and label when .name is missing on actor objects", () => {
    expect(
      resolveFieldValue(
        {
          threat: {
            actors: [{ id: "att&ck::G0007" }, { label: "att&ck::G0016" }],
          },
        },
        "threat.actors.name",
      ),
    ).toEqual(["att&ck::G0007", "att&ck::G0016"]);
  });

  it("does not leak signal names into severity pins", () => {
    expect(
      resolveFieldValue(
        {
          objective: {
            signals: [
              { uuid: "sig-1", name: "Suspicious login" },
              { uuid: "sig-2", name: "Token theft" },
            ],
          },
        },
        "objective.signals.severity",
      ),
    ).toEqual([]);
  });

  it("inherits techniques from summary injection", () => {
    expect(
      collectRuleTechniques({
        _techniques: ["T1059", "T1078"],
      }),
    ).toEqual(["T1059", "T1078"]);
  });
});
