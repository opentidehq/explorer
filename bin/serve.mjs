/**
 * `opentide-explorer serve`: the static explorer on a local HTTP server. Node's own
 * `http`, no dependencies, so `npx @opentide/explorer serve` starts without a framework.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const DEFAULT_PORT = 4173;
export const DEFAULT_HOST = "127.0.0.1";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/**
 * Options after the `serve` subcommand: the build options, plus where to listen and an
 * existing export to serve instead of building one. As in `build`, a flag without a value
 * keeps its default and never takes the next flag as its value.
 * @param {string[]} argv
 */
export function parseServeArgs(argv) {
  const args = {
    exportsDir: /** @type {string | null} */ (null),
    schemasDir: /** @type {string | null} */ (null),
    output: path.join(process.cwd(), "out", "explorer"),
    basePath: "",
    dir: /** @type {string | null} */ (null),
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: opentide-explorer serve [options]

Builds the explorer for --exports-dir, then serves it. With --dir, serves an
existing build instead (one made without --base-path).

Options:
  --exports-dir <path>   Directory with explorer.*.json exports
  --schemas-dir <path>   JSON Schema directory for TS codegen
  --output <path>        Where the build is written (default: out/explorer)
  --dir <path>           Serve this build; skips building
  --port <number>        Port to listen on (default: ${DEFAULT_PORT}; 0 picks one)
  --host <address>       Address to listen on (default: ${DEFAULT_HOST})
`);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) continue;
    if (arg === "--exports-dir") args.exportsDir = value;
    else if (arg === "--schemas-dir") args.schemasDir = value;
    else if (arg === "--output") args.output = value;
    else if (arg === "--dir") args.dir = value;
    else if (arg === "--host") args.host = value;
    else if (arg === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`--port must be a port number, not ${value}`);
      }
      args.port = port;
    } else continue;
    i++;
  }

  return args;
}

/**
 * What a request path maps to in `root`: a file, a redirect to the slash-terminated
 * directory URL (the export uses `trailingSlash`), or nothing. Never a path outside `root`.
 * @param {string} root Absolute directory.
 * @param {string} pathname The URL path, still percent-encoded.
 * @returns {{ file: string } | { redirect: string } | null}
 */
export function resolveRequest(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return null;
  }
  if (stat.isFile()) return { file: target };
  if (!stat.isDirectory()) return null;
  // Rebuilt from the path inside the export, never echoed: `//evil.com/..%2fdata` resolves
  // to data/, and a Location of `//evil.com/…` would send the browser off the server.
  if (!pathname.endsWith("/")) {
    const rel = path
      .relative(root, target)
      .split(path.sep)
      .map(encodeURIComponent);
    return { redirect: `/${rel.join("/")}/` };
  }
  const index = path.join(target, "index.html");
  return fs.existsSync(index) ? { file: index } : null;
}

/**
 * Stream `file` with its content type. A file that cannot be read (removed by a rebuild,
 * or unreadable) answers 500 instead of taking the server down.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} file
 * @param {boolean} head
 */
function sendFile(res, status, file, head) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    res
      .writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Unreadable file");
    return;
  }
  const type =
    CONTENT_TYPES[
      /** @type {keyof typeof CONTENT_TYPES} */ (path.extname(file))
    ] ?? "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Content-Length": size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
  };
  if (head) {
    res.writeHead(status, headers).end();
    return;
  }
  const stream = fs.createReadStream(file);
  stream.once("open", () => {
    res.writeHead(status, headers);
    stream.pipe(res);
  });
  stream.once("error", () => {
    if (res.headersSent) res.destroy();
    else
      res
        .writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
        .end("Unreadable file");
  });
}

/**
 * A server for the static export in `dir`, not yet listening.
 * @param {string} dir
 */
export function createStaticServer(dir) {
  const root = path.resolve(dir);
  const notFound = path.join(root, "404.html");

  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const head = req.method === "HEAD";
    const url = new URL(req.url ?? "/", "http://localhost");
    const found = resolveRequest(root, url.pathname);

    if (found && "redirect" in found) {
      res.writeHead(308, { Location: found.redirect + url.search }).end();
    } else if (found) {
      sendFile(res, 200, found.file, head);
    } else if (fs.existsSync(notFound)) {
      sendFile(res, 404, notFound, head);
    } else {
      res
        .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        .end("Not found");
    }
  });
}

/**
 * Serve `dir` until the process is stopped.
 * @param {string} dir
 * @param {{ port: number, host: string }} options
 * @returns {Promise<http.Server>}
 */
export function serve(dir, { port, host }) {
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, "index.html"))) {
    return Promise.reject(
      new Error(`No explorer build in ${root} (index.html is missing)`),
    );
  }
  const server = createStaticServer(root);
  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      const code = /** @type {NodeJS.ErrnoException} */ (err).code;
      reject(
        code === "EADDRINUSE"
          ? new Error(`Port ${port} is in use; pass --port to pick another`)
          : err,
      );
    });
    server.listen(port, host, () => {
      const address = server.address();
      const bound =
        typeof address === "object" && address ? address.port : port;
      const shown = host.includes(":") ? `[${host}]` : host;
      console.log(
        `opentide explorer: http://${shown}:${bound}/  (Ctrl+C stops it)`,
      );
      resolve(server);
    });
  });
}
