import { describe, expect, it } from "vitest";
import {
  actorRefName,
  collectActorNames,
  techniqueList,
} from "./corpus-fields.mjs";

describe("actorRefName", () => {
  it("reads strings and {name}/{id} objects", () => {
    expect(actorRefName("att&ck::G0007")).toBe("att&ck::G0007");
    expect(actorRefName({ name: "att&ck::G0125" })).toBe("att&ck::G0125");
    expect(actorRefName({ id: "misp::abc" })).toBe("misp::abc");
    expect(actorRefName({ foo: "bar" })).toBe("");
  });
});

describe("collectActorNames", () => {
  it("accepts both string and ThreatActor object shapes", () => {
    expect(
      collectActorNames([
        "att&ck::G0007",
        { name: "att&ck::G0125" },
        { name: "att&ck::G0125" },
      ]),
    ).toEqual(["att&ck::G0007", "att&ck::G0125"]);
  });
});

describe("techniqueList", () => {
  it("prefers the first non-empty candidate", () => {
    expect(techniqueList(["T1078.004"], ["T1110"])).toEqual(["T1078.004"]);
    expect(techniqueList([], ["T1110"])).toEqual(["T1110"]);
    expect(techniqueList(undefined, ["T1601.001", "T1542.003"])).toEqual([
      "T1601.001",
      "T1542.003",
    ]);
    expect(techniqueList(undefined, [])).toEqual([]);
  });
});
