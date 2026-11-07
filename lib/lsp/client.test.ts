import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { LanguageClient, type Transport } from "@/lib/lsp/client";
import { buildObjectDocument, regionTokens } from "@/lib/lsp/object-document";
import type { BundleObjectSummary } from "@/lib/opentide/types";

/**
 * The client against a scripted server: the JSON-RPC it sends, and how it reads replies.
 */
function scripted(reply: (message: Record<string, unknown>) => unknown[]) {
  const sent: Array<Record<string, unknown>> = [];
  let listener: (text: string) => void = () => {};
  const transport: Transport = {
    send: (text) => {
      const message = JSON.parse(text) as Record<string, unknown>;
      sent.push(message);
      for (const out of reply(message)) {
        queueMicrotask(() => listener(JSON.stringify(out)));
      }
    },
    listen: (onMessage) => {
      listener = onMessage;
    },
    close: () => {},
  };
  return { transport, sent };
}

describe("LanguageClient (scripted server)", () => {
  it("initializes with the workspace, opens, and reads diagnostics and tokens", async () => {
    const { transport, sent } = scripted((m) => {
      if (m.method === "initialize")
        return [
          {
            jsonrpc: "2.0",
            id: m.id,
            result: {
              capabilities: {
                semanticTokensProvider: { legend: { tokenTypes: ["keyword"] } },
              },
              serverInfo: { name: "opentide-lsp", version: "9.9.9" },
            },
          },
        ];
      if (m.method === "textDocument/didOpen")
        return [
          {
            jsonrpc: "2.0",
            method: "textDocument/publishDiagnostics",
            params: {
              uri: "file:///a.yaml",
              version: 1,
              diagnostics: [
                {
                  range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 1 },
                  },
                  severity: 2,
                  code: "c",
                  message: "m",
                },
              ],
            },
          },
          { jsonrpc: "2.0", id: 99, method: "client/registerCapability" },
        ];
      if (m.method === "textDocument/semanticTokens/full")
        return [
          { jsonrpc: "2.0", id: m.id, result: { data: [0, 0, 4, 0, 0] } },
        ];
      if (m.method === "textDocument/hover")
        return [
          {
            jsonrpc: "2.0",
            id: m.id,
            result: { contents: { kind: "markdown", value: "**x**" } },
          },
        ];
      return [];
    });
    const client = new LanguageClient(transport, {
      objects: [{ uuid: "u", schema: "threat::1.0" }],
    });
    expect(await client.ready).toEqual({
      name: "opentide-lsp",
      version: "9.9.9",
    });
    const analysis = await client.open("file:///a.yaml", "name: x\n");
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({ severity: 2, code: "c", message: "m" }),
    ]);
    expect(analysis.tokens).toEqual([
      { line: 0, character: 0, length: 4, type: "keyword" },
    ]);
    expect(
      await client.hover("file:///a.yaml", { line: 0, character: 1 }),
    ).toBe("**x**");

    const init = sent.find((m) => m.method === "initialize")!;
    expect(init.params).toMatchObject({
      initializationOptions: {
        workspace: { objects: [{ uuid: "u", schema: "threat::1.0" }] },
      },
    });
    // The server's own request is acknowledged.
    expect(sent).toContainEqual({ jsonrpc: "2.0", id: 99, result: null });
  });

  it("rejects every call when the server does not start", async () => {
    const { transport } = scripted((m) =>
      m.method === "initialize"
        ? [
            {
              jsonrpc: "2.0",
              id: m.id,
              error: { code: -32603, message: "did not load" },
            },
          ]
        : [],
    );
    const client = new LanguageClient(transport);
    await expect(client.ready).rejects.toThrow("did not load");
    await expect(client.open("file:///a.yaml", "")).rejects.toThrow(
      "did not load",
    );
  });
});

/* The real server -------------------------------------------------------------------- */

const LSP_DIR = path.resolve(import.meta.dirname, "../../public/lsp");
const glue = path.join(LSP_DIR, "opentide_wasm.js");
const wasm = path.join(LSP_DIR, "opentide_wasm_bg.wasm");
const haveWasm = fs.existsSync(glue) && fs.existsSync(wasm);

interface Glue {
  initSync(init: { module: Uint8Array }): unknown;
  LanguageServer: new () => {
    handle(message: string): string[];
    free(): void;
  };
}

/**
 * `pnpm lsp:fetch` puts the pinned WASM build in public/lsp; without it, this suite is
 * skipped (the build works without the language server, and so must the tests).
 */
describe.skipIf(!haveWasm)("LanguageClient (opentide-wasm)", async () => {
  const wasmGlue = (await import(
    /* @vite-ignore */ pathToFileURL(glue).href
  )) as Glue;
  wasmGlue.initSync({ module: fs.readFileSync(wasm) });
  const server = new wasmGlue.LanguageServer();
  let listener: (text: string) => void = () => {};
  const client = new LanguageClient(
    {
      send: (text) => {
        const replies = server.handle(text);
        queueMicrotask(() => replies.forEach((reply) => listener(reply)));
      },
      listen: (onMessage) => {
        listener = onMessage;
      },
      close: () => server.free(),
    },
    {
      objects: [
        {
          uuid: "fb62e879-9e91-4c5b-aaa7-999b2b1b3897",
          schema: "objective::1.0",
          name: "Detect Shai-Hulud",
        },
      ],
    },
  );
  afterAll(() => client.dispose());

  const summary: BundleObjectSummary = {
    uuid: "bfae62bb-7ce1-46cd-a131-39803832fa9d",
    type: "rule",
    name: "Shai-Hulud Rule",
    techniques: [],
    actors: [],
    relatedCount: 0,
    platforms: ["defender_for_endpoint", "sentinel"],
    path: "objects/rules/shai-hulud-rule.yaml",
  };
  const body = {
    name: "Shai-Hulud Rule",
    metadata: {
      uuid: summary.uuid,
      schema: "rule::1.0",
    },
    detection_model: "fb62e879-9e91-4c5b-aaa7-999b2b1b3897",
    configurations: {
      defender_for_endpoint: {
        status: "PRODUCTION",
        query:
          'DeviceProcessEvents\n| where FileName =~ "npm.exe"\n| summarize count() by DeviceName\n',
      },
      sentinel: {
        status: "STAGING",
        query: "SecurityEvent | wher EventID == 4688\n",
      },
    },
  };

  it("names itself", async () => {
    expect((await client.ready).name).toBe("opentide-lsp");
  });

  it("analyses the object and its queries in one document", async () => {
    const doc = await buildObjectDocument(summary, body);
    const analysis = await client.open(doc.uri, doc.text);
    const codes = analysis.diagnostics.map((d) => d.code);
    expect(codes).toContain("kql_unknown_operator");
    expect(codes).toContain("schema_validation");
    // The objective is known by its metadata: the reference resolves.
    expect(codes).not.toContain("invalid_ref");

    const defender = doc.queries.get("defender_for_endpoint")!;
    const tokens = regionTokens(defender, analysis.tokens ?? []);
    expect(tokens).toContainEqual({
      line: 2,
      character: 2,
      length: 9,
      type: "keyword",
    });

    const typo = analysis.diagnostics.find(
      (d) => d.code === "kql_unknown_operator",
    )!;
    const sentinel = doc.queries.get("sentinel")!;
    expect(typo.range.start.line).toBe(sentinel.line);
  });

  it("hovers inside a query with its platform's profile", async () => {
    const doc = await buildObjectDocument(summary, body);
    const defender = doc.queries.get("defender_for_endpoint")!;
    const hover = await client.hover(doc.uri, {
      line: defender.line,
      character: defender.columns[0]! + 3,
    });
    expect(hover).toContain("DeviceProcessEvents");
  });
});
