/**
 * The explorer's one language server: started on first use in a Web Worker, shared by every
 * code panel, and kept for the session. It holds the analysis of the objects opened, so
 * switching tabs or coming back to an object asks nothing again.
 *
 * Without the WASM build (a site built offline, a browser without module workers) the
 * service reports `unavailable` and every caller keeps working without it.
 */
import {
  LanguageClient,
  type DocumentAnalysis,
  type ServerInfo,
  type Transport,
  type WorkspaceObject,
} from "@/lib/lsp/client";
import {
  buildObjectDocument,
  type ObjectDocument,
} from "@/lib/lsp/object-document";
import type { Position } from "@/lib/lsp/protocol";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

export type ServerStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; server: ServerInfo }
  | { state: "unavailable"; reason: string };

export interface ObjectAnalysis {
  document: ObjectDocument;
  analysis: DocumentAnalysis;
}

/** How many analysed objects stay open in the server; the oldest is closed past it. */
const OPEN_LIMIT = 48;

function assetBase(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

function workerTransport(): Transport {
  const worker = new Worker(new URL("./lsp.worker.ts", import.meta.url), {
    type: "module",
    name: "opentide-lsp",
  });
  const origin = window.location.origin;
  worker.postMessage({
    type: "load",
    glue: `${origin}${assetBase()}/lsp/opentide_wasm.js`,
    wasm: `${origin}${assetBase()}/lsp/opentide_wasm_bg.wasm`,
  });
  return {
    send: (message) => worker.postMessage(message),
    listen: (onMessage) => {
      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (typeof event.data === "string") onMessage(event.data);
      });
      worker.addEventListener("error", (event) => {
        // A worker that cannot start answers nothing: fail what waits on it.
        event.preventDefault();
        onMessage(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: {
              code: -32603,
              message: event.message || "the language server worker failed",
            },
          }),
        );
      });
    },
    close: () => worker.terminate(),
  };
}

/** What the page knows about one object: each part null until it is there. */
export interface ObjectSnapshot {
  document: ObjectDocument | null;
  analysis: DocumentAnalysis | null;
  /** Why there is no analysis, when the server could not give one. */
  error: string | null;
}

const EMPTY: ObjectSnapshot = { document: null, analysis: null, error: null };

export class LanguageService {
  private client: LanguageClient | null = null;
  private status: ServerStatus = { state: "idle" };
  private readonly listeners = new Set<() => void>();
  private readonly documents = new Map<string, Promise<ObjectDocument>>();
  private readonly analyses = new Map<string, Promise<ObjectAnalysis>>();
  /** One stable object per uuid, replaced on change (`useSyncExternalStore` snapshots). */
  private readonly snapshots = new Map<string, ObjectSnapshot>();
  /** Analysed objects whose documents are open in the server, oldest first. */
  private readonly open = new Map<string, string>();
  private readonly hovers = new Map<string, Promise<string | null>>();
  private objects: WorkspaceObject[] = [];
  private readonly connect: () => Transport;

  constructor(connect: () => Transport = workerTransport) {
    this.connect = connect;
  }

  /** The objects the server should know, by metadata, before the first document opens. */
  setWorkspace(objects: WorkspaceObject[]) {
    if (!this.client) this.objects = objects;
  }

  getStatus = (): ServerStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** What is known about an object now: the same object until something changes. */
  snapshot(uuid: string): ObjectSnapshot {
    return this.snapshots.get(uuid) ?? EMPTY;
  }

  /** The analysis of an object, if it has finished. */
  peek(uuid: string): ObjectAnalysis | undefined {
    const { document, analysis } = this.snapshot(uuid);
    return document && analysis ? { document, analysis } : undefined;
  }

  /** An object's document (its YAML and query regions), built once; needs no server. */
  document(
    summary: BundleObjectSummary,
    body: ObjectBody,
  ): Promise<ObjectDocument> {
    let document = this.documents.get(summary.uuid);
    if (!document) {
      document = buildObjectDocument(summary, body);
      this.documents.set(summary.uuid, document);
      document.then(
        (built) => this.update(summary.uuid, { document: built }),
        (error: unknown) => {
          this.documents.delete(summary.uuid);
          this.update(summary.uuid, { error: errorText(error) });
        },
      );
    }
    return document;
  }

  /** Analyse an object, once: later calls share the first result. */
  analyze(
    summary: BundleObjectSummary,
    body: ObjectBody,
  ): Promise<ObjectAnalysis> {
    const known = this.analyses.get(summary.uuid);
    if (known) return known;
    const job = (async () => {
      const client = this.start();
      const document = await this.document(summary, body);
      const analysis = await client.open(document.uri, document.text);
      this.open.set(summary.uuid, document.uri);
      this.update(summary.uuid, { document, analysis, error: null });
      this.evict();
      return { document, analysis };
    })();
    this.analyses.set(summary.uuid, job);
    job.catch((error: unknown) => {
      // Not remembered: a later call tries again.
      this.analyses.delete(summary.uuid);
      this.update(summary.uuid, { error: errorText(error) });
    });
    return job;
  }

  /** Hover in an analysed document, remembered per position. */
  hover(uri: string, position: Position): Promise<string | null> {
    const key = `${uri}\n${position.line}:${position.character}`;
    let hover = this.hovers.get(key);
    if (!hover) {
      hover = this.start()
        .hover(uri, position)
        .catch(() => null);
      this.hovers.set(key, hover);
    }
    return hover;
  }

  private update(uuid: string, patch: Partial<ObjectSnapshot>) {
    this.snapshots.set(uuid, { ...this.snapshot(uuid), ...patch });
    this.emit();
  }

  private start(): LanguageClient {
    if (this.client) return this.client;
    this.setStatus({ state: "loading" });
    let transport: Transport;
    try {
      transport = this.connect();
    } catch (error) {
      transport = {
        send: () => {},
        listen: (onMessage) =>
          queueMicrotask(() =>
            onMessage(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                error: {
                  code: -32603,
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              }),
            ),
          ),
        close: () => {},
      };
    }
    const client = new LanguageClient(transport, { objects: this.objects });
    client.ready.then(
      (server) => this.setStatus({ state: "ready", server }),
      (error: unknown) =>
        this.setStatus({
          state: "unavailable",
          reason: error instanceof Error ? error.message : String(error),
        }),
    );
    this.client = client;
    return client;
  }

  /**
   * Close the oldest documents past the limit, so the server's memory stays bounded. Their
   * analysis is dropped too (a hover needs the document open); opening one again re-runs it.
   */
  private evict() {
    for (const [uuid, uri] of this.open) {
      if (this.open.size <= OPEN_LIMIT) break;
      this.open.delete(uuid);
      this.client?.close(uri);
      this.analyses.delete(uuid);
      this.update(uuid, { analysis: null });
      for (const key of this.hovers.keys()) {
        if (key.startsWith(`${uri}\n`)) this.hovers.delete(key);
      }
    }
  }

  private setStatus(status: ServerStatus) {
    this.status = status;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let shared: LanguageService | null = null;

/** The page's language service. */
export function languageService(): LanguageService {
  shared ??= new LanguageService();
  return shared;
}
