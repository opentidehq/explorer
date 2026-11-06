import { describe, expect, it } from "vitest";
import {
  findLogSource,
  logSourceKey,
  logSourcesFor,
  matchesLogSource,
  normalizeVisibility,
  visibilityOverview,
} from "@/lib/opentide/visibility";
import { VISIBILITY_FIXTURE } from "@/lib/opentide/test-fixtures";

describe("normalizeVisibility", () => {
  it("reads the export opentide writes", () => {
    const visibility = normalizeVisibility(VISIBILITY_FIXTURE);
    expect(visibility).not.toBeNull();
    expect(visibility!.tlp).toBe("amber");
    expect(visibility!.logsources.map(logSourceKey)).toEqual([
      "sentinel:SecurityEvent",
      "sentinel:Contoso_Audit_CL",
      "splunk:WinEventLog:Security",
    ]);
    const security = findLogSource(visibility!, "sentinel:SecurityEvent")!;
    expect(security.columns[0]).toEqual({
      name: "EventID",
      type: "int",
      description: "The event's identifier.",
    });
  });

  it("refuses what it cannot read rather than guessing", () => {
    expect(normalizeVisibility(null)).toBeNull();
    expect(normalizeVisibility("nope")).toBeNull();
    expect(normalizeVisibility({ version: "2.0", logsources: [] })).toBeNull();
    expect(normalizeVisibility({ logsources: [] })).toBeNull();
  });

  it("tolerates missing keys and an unknown TLP", () => {
    const visibility = normalizeVisibility({
      version: "1.0",
      tlp: "pink",
      logsources: [{ name: "X", system: "sentinel", read_by: ["r"] }],
    })!;
    expect(visibility.tlp).toBe("amber");
    expect(visibility.logsources[0]!.rules).toEqual(["r"]);
    expect(visibility.logsources[0]!.columns).toEqual([]);
    expect(visibility.undeclared).toEqual([]);
  });
});

describe("what uses a log source", () => {
  const visibility = normalizeVisibility(VISIBILITY_FIXTURE);

  it("finds a rule's, a signal's and an objective's log sources, and how", () => {
    expect(
      logSourcesFor(visibility, "rule-1").map(({ source, how }) => [
        logSourceKey(source),
        how,
      ]),
    ).toEqual([
      ["sentinel:SecurityEvent", "query"],
      ["splunk:WinEventLog:Security", "signal"],
    ]);
    expect(logSourcesFor(visibility, "signal-1").map(({ how }) => how)).toEqual(
      ["signal"],
    );
    expect(
      logSourcesFor(visibility, "objective-1").map(({ how }) => how),
    ).toEqual(["objective"]);
    expect(logSourcesFor(null, "rule-1")).toEqual([]);
  });

  it("counts log sources per system and what needs attention", () => {
    const overview = visibilityOverview(visibility!);
    expect(overview).toMatchObject({
      logsources: 3,
      withColumns: 1,
      used: 2,
      withoutColumns: 2,
      unused: 1,
      undeclared: 1,
    });
    expect(overview.systems[0]).toEqual({
      name: "sentinel",
      logsources: 2,
      withColumns: 1,
      used: 1,
    });
  });

  it("searches names and descriptions", () => {
    expect(matchesLogSource({ name: "SecurityEvent" }, "security")).toBe(true);
    expect(
      matchesLogSource(
        { name: "X", description: "domain controllers" },
        "domain",
      ),
    ).toBe(true);
    expect(matchesLogSource({ name: "X" }, "audit")).toBe(false);
  });
});
