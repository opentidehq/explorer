/// <reference lib="webworker" />
/**
 * The opentide language server in a Web Worker: `opentide-wasm`'s `LanguageServer` (the
 * server `opentide-lsp --stdio` runs, compiled to `wasm32-unknown-unknown`), off the main
 * thread.
 *
 * The first message names the wasm-bindgen glue and the module to load (`LoadMessage`).
 * Every later message is one JSON-RPC message from the client, as JSON text, and every
 * message the worker posts is one from the server: the contract of `serveLanguageServer` in
 * `@opentide/lsp-worker`. Messages that arrive while the module loads are handled in order
 * once it has. If it fails to load or stops, each request is answered with an error that
 * says so, never with an empty result.
 */

export interface LoadMessage {
  type: "load";
  /** URL of `opentide_wasm.js` (`wasm-bindgen --target web`). */
  glue: string;
  /** URL of `opentide_wasm_bg.wasm`. */
  wasm: string;
}

interface Session {
  handle(message: string): string[];
  readonly closed: boolean;
  free?(): void;
}

interface Glue {
  default: (init: { module_or_path: unknown }) => Promise<unknown>;
  LanguageServer: new () => Session;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

let session: Session | undefined;
let failure: string | undefined;
let queue: string[] | undefined = [];
let loading = false;

function requestId(text: string): string | number | undefined {
  try {
    const message = JSON.parse(text) as { id?: unknown; method?: unknown };
    return typeof message.method === "string" &&
      (typeof message.id === "string" || typeof message.id === "number")
      ? message.id
      : undefined;
  } catch {
    return undefined;
  }
}

function refuse(text: string) {
  const id = requestId(text);
  if (id === undefined) return;
  scope.postMessage(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: failure },
    }),
  );
}

function handle(text: string) {
  if (!session || failure !== undefined) return refuse(text);
  let replies: string[];
  try {
    replies = session.handle(text);
  } catch (error) {
    failure = `the opentide language server stopped: ${error instanceof Error ? error.message : String(error)}`;
    return refuse(text);
  }
  for (const reply of replies) scope.postMessage(reply);
  if (session.closed) {
    session.free?.();
    session = undefined;
    failure = "the opentide language server has exited";
    scope.close();
  }
}

async function load(message: LoadMessage) {
  try {
    // A URL known only at run time: the bundler leaves it to the browser.
    const glue = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ message.glue
    )) as Glue;
    await glue.default({ module_or_path: message.wasm });
    session = new glue.LanguageServer();
  } catch (error) {
    failure = `the opentide language server did not load: ${error instanceof Error ? error.message : String(error)}`;
  }
  const waiting = queue ?? [];
  queue = undefined;
  for (const text of waiting) handle(text);
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (
    !loading &&
    data &&
    typeof data === "object" &&
    (data as LoadMessage).type === "load"
  ) {
    loading = true;
    void load(data as LoadMessage);
    return;
  }
  const text = typeof data === "string" ? data : JSON.stringify(data);
  if (queue) queue.push(text);
  else handle(text);
});
