import { describe, expect, it } from "vitest";
import {
  buildObjectDocument,
  objectUri,
  regionDiagnostics,
  regionTokens,
  toFile,
  toPanel,
} from "@/lib/lsp/object-document";
import type { Diagnostic } from "@/lib/lsp/protocol";
import type { BundleObjectSummary } from "@/lib/opentide/types";

const summary: BundleObjectSummary = {
  uuid: "bfae62bb-7ce1-46cd-a131-39803832fa9d",
  type: "rule",
  name: "Rule",
  techniques: [],
  actors: [],
  relatedCount: 0,
  platforms: [],
  path: "objects/rules/rule.yaml",
};

const body = {
  name: "Rule",
  configurations: {
    sentinel: {
      status: "STAGING",
      query: "SecurityEvent\n| where EventID == 4688\n",
    },
    splunk: { query: "index=main | stats count by host" },
    elastic: { query: "a: b # quoted" },
  },
};

describe("objectUri", () => {
  it("uses the corpus path, under objects/", () => {
    expect(objectUri(summary)).toBe("file:///corpus/objects/rules/rule.yaml");
    expect(objectUri({ ...summary, path: "rules/my rule.yml" })).toBe(
      "file:///corpus/objects/rules/my%20rule.yml",
    );
  });

  it("falls back to a path from the type and uuid", () => {
    expect(objectUri({ ...summary, path: undefined })).toBe(
      `file:///corpus/objects/rules/${summary.uuid}.yaml`,
    );
  });
});

describe("buildObjectDocument", () => {
  it("maps literal block and plain queries onto the YAML, and skips quoted ones", async () => {
    const doc = await buildObjectDocument(summary, body);
    const lines = doc.text.split("\n");

    const sentinel = doc.queries.get("sentinel")!;
    expect(sentinel.text).toBe("SecurityEvent\n| where EventID == 4688");
    sentinel.text.split("\n").forEach((line, i) => {
      const at = toFile(sentinel, { line: i, character: 0 })!;
      expect(lines[at.line]!.slice(at.character)).toBe(line);
    });

    const splunk = doc.queries.get("splunk")!;
    expect(splunk.text).toBe("index=main | stats count by host");
    const at = toFile(splunk, { line: 0, character: 6 })!;
    expect(lines[at.line]!.slice(at.character, at.character + 4)).toBe("main");

    expect(doc.queries.has("elastic")).toBe(false);
  });

  it("round-trips positions and moves tokens and diagnostics into the panel", async () => {
    const doc = await buildObjectDocument(summary, body);
    const region = doc.queries.get("sentinel")!;
    const file = toFile(region, { line: 1, character: 2 })!;
    expect(toPanel(region, file)).toEqual({ line: 1, character: 2 });
    expect(toPanel(region, { line: region.line - 1, character: 9 })).toBeNull();

    const tokens = regionTokens(region, [
      { line: 0, character: 0, length: 4, type: "property" },
      { ...file, length: 5, type: "keyword" },
    ]);
    expect(tokens).toEqual([
      { line: 1, character: 2, length: 5, type: "keyword" },
    ]);

    const diagnostic = (
      line: number,
      start: number,
      end: number,
    ): Diagnostic => ({
      severity: 1,
      message: "m",
      range: {
        start: { line, character: start },
        end: { line, character: end },
      },
    });
    const mapped = regionDiagnostics(region, [
      diagnostic(file.line, file.character, file.character + 5),
      diagnostic(region.line - 1, 0, 4),
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]!.range).toEqual({
      start: { line: 1, character: 2 },
      end: { line: 1, character: 7 },
    });
  });
});
