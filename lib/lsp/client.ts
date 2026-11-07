/**
 * A small language client for the opentide language server: just what the explorer's code
 * panels need (initialize, open documents, their diagnostics and semantic tokens, hover).
 * It speaks JSON-RPC text over any transport: in the browser, a Web Worker running the
 * server's WASM build (`lsp.worker.ts`); in tests, the module itself.
 *
 * Objects in the explorer never change, so a document is opened once and its analysis kept;
 * the caller closes documents it no longer needs.
 */
import {
  decodeSemanticTokens,
  severityOf,
  type Diagnostic,
  type Position,
  type SemanticToken,
} from "@/lib/lsp/protocol";

/** Where JSON-RPC text goes and comes from. */
export interface Transport {
  send(message: string): void;
  /** Register the one listener for messages from the server. */
  listen(onMessage: (message: string) => void): void;
  close(): void;
}

/**
 * An object the server knows by its metadata alone (`initializationOptions.workspace.objects`),
 * so a reference to it resolves and hover names it.
 */
export interface WorkspaceObject {
  uuid: string;
  schema: string;
  name?: string;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface DocumentAnalysis {
  uri: string;
  version: number;
  diagnostics: Diagnostic[];
  /** Null when the server returned none for this document. */
  tokens: SemanticToken[] | null;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ["utf-16"] },
  textDocument: {
    synchronization: { dynamicRegistration: false },
    hover: { contentFormat: ["markdown", "plaintext"] },
    publishDiagnostics: { relatedInformation: false },
    semanticTokens: {
      requests: { full: true },
      tokenTypes: [],
      tokenModifiers: [],
      formats: ["relative"],
    },
  },
};

function rawDiagnostic(value: unknown): Diagnostic | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  const range = d["range"] as Diagnostic["range"] | undefined;
  if (!range?.start || !range.end) return null;
  const code = d["code"];
  return {
    range,
    severity: severityOf(d["severity"]),
    message: typeof d["message"] === "string" ? d["message"] : "",
    code:
      typeof code === "string" || typeof code === "number"
        ? String(code)
        : undefined,
    source: typeof d["source"] === "string" ? d["source"] : undefined,
  };
}

/** One part of a hover's contents: a string, `MarkupContent`, or a `MarkedString`. */
function hoverPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const { language, value: text } = value as {
      language?: string;
      value: string;
    };
    return language ? `\`\`\`${language}\n${text}\n\`\`\`` : text;
  }
  return "";
}

function hoverText(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const contents = (result as { contents?: unknown }).contents;
  const text = Array.isArray(contents)
    ? contents.map(hoverPart).filter(Boolean).join("\n\n")
    : hoverPart(contents);
  return text.trim() ? text : null;
}

export class LanguageClient {
  readonly ready: Promise<ServerInfo>;
  private readonly transport: Transport;
  private nextId = 0;
  private readonly pending = new Map<number | string, Pending>();
  private readonly published = new Map<string, Diagnostic[]>();
  private readonly versions = new Map<string, number>();
  private tokenTypes: string[] = [];
  private closed = false;
  private failure: Error | null = null;

  constructor(
    transport: Transport,
    workspace: { objects: WorkspaceObject[] } = { objects: [] },
  ) {
    this.transport = transport;
    transport.listen((text) => this.receive(text));
    this.ready = this.request("initialize", {
      processId: null,
      clientInfo: { name: "opentide-explorer" },
      rootUri: null,
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: { workspace },
    }).then((value) => {
      const result = value as {
        capabilities?: {
          semanticTokensProvider?: { legend?: { tokenTypes?: string[] } };
        };
        serverInfo?: { name?: string; version?: string };
      };
      this.tokenTypes =
        result.capabilities?.semanticTokensProvider?.legend?.tokenTypes ?? [];
      this.notify("initialized", {});
      return {
        name: result.serverInfo?.name ?? "opentide-lsp",
        version: result.serverInfo?.version ?? "",
      };
    });
    // A failed start is reported by `ready` and by every later call.
    this.ready.catch((error: unknown) => {
      this.failure = error instanceof Error ? error : new Error(String(error));
    });
  }

  /**
   * Open `text` as `uri` and return what the server says about it: the diagnostics it
   * publishes and its semantic tokens. The server handles messages in order, so the
   * diagnostics `didOpen` publishes arrive before the tokens' response.
   */
  async open(
    uri: string,
    text: string,
    languageId = "opentide-yaml",
  ): Promise<DocumentAnalysis> {
    await this.ready;
    const version = (this.versions.get(uri) ?? 0) + 1;
    if (this.versions.has(uri)) {
      this.notify("textDocument/didClose", { textDocument: { uri } });
    }
    this.versions.set(uri, version);
    this.published.delete(uri);
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version, text },
    });
    const result = (await this.request("textDocument/semanticTokens/full", {
      textDocument: { uri },
    })) as { data?: number[] } | null;
    return {
      uri,
      version,
      diagnostics: this.published.get(uri) ?? [],
      tokens: result?.data
        ? decodeSemanticTokens(result.data, this.tokenTypes)
        : null,
    };
  }

  /** The server's hover at `position`, as Markdown, or null when it has none. */
  async hover(uri: string, position: Position): Promise<string | null> {
    await this.ready;
    const result = await this.request("textDocument/hover", {
      textDocument: { uri },
      position,
    });
    return hoverText(result);
  }

  close(uri: string) {
    if (!this.versions.has(uri) || this.closed) return;
    this.versions.delete(uri);
    this.published.delete(uri);
    this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  /** Shut the server down and release the transport. */
  async dispose() {
    if (this.closed) return;
    try {
      await this.ready;
      await this.request("shutdown", null);
      this.notify("exit", null);
    } catch {
      // A server that never started has nothing to shut down.
    }
    this.closed = true;
    this.transport.close();
    for (const { reject } of this.pending.values()) {
      reject(new Error("the language client was disposed"));
    }
    this.pending.clear();
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("the language client was disposed"));
    }
    if (this.failure && method !== "initialize") {
      return Promise.reject(this.failure);
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.transport.send(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      );
    });
  }

  private notify(method: string, params: unknown) {
    if (this.closed) return;
    this.transport.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  private receive(text: string) {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(text) as JsonRpcMessage;
    } catch {
      return;
    }
    if (message.method === undefined) {
      if (message.id === undefined || message.id === null) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? null);
      return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as {
        uri?: string;
        version?: number;
        diagnostics?: unknown[];
      };
      if (!params?.uri) return;
      const current = this.versions.get(params.uri);
      if (params.version !== undefined && params.version !== current) return;
      this.published.set(
        params.uri,
        (params.diagnostics ?? [])
          .map(rawDiagnostic)
          .filter((d): d is Diagnostic => d !== null),
      );
      return;
    }
    // A request from the server (`client/registerCapability`, a refresh): acknowledge it,
    // so nothing waits on the explorer.
    if (message.id !== undefined && message.id !== null) {
      this.transport.send(
        JSON.stringify({ jsonrpc: "2.0", id: message.id, result: null }),
      );
    }
  }
}
