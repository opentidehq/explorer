#!/usr/bin/env node
/**
 * @opentide/explorer CLI. The `opentide explorer` commands run this through npx:
 *
 *   opentide-explorer build --exports-dir .opentide/exports   static site → out/explorer
 *   opentide-explorer serve --exports-dir .opentide/exports   build, then serve on localhost
 *   opentide-explorer serve --dir out/explorer                serve an existing build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../scripts/lib/is-main.mjs";
import { build, parseArgs } from "./build.mjs";
import { parseServeArgs, serve } from "./serve.mjs";

const PACKAGE_JSON = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);

const USAGE = `Usage: opentide-explorer <command> [options]

Commands:
  build    Build the static explorer for a corpus's exports
  serve    Build it, then serve it on localhost (or serve a build with --dir)

Run opentide-explorer <command> --help for its options.
`;

/** @param {string[]} argv */
export async function run(argv) {
  const [command, ...rest] = argv;
  if (command === "--version" || command === "-v") {
    console.log(JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")).version);
    return;
  }
  if (command === "build") {
    await build(parseArgs(rest));
    return;
  }
  if (command === "serve") {
    const args = parseServeArgs(rest);
    let dir = args.dir;
    if (!dir) {
      if (!args.exportsDir) {
        throw new Error(
          "serve needs --exports-dir to build, or --dir to serve a build",
        );
      }
      // Served from the root, so never under a base path.
      dir = await build({ ...args, basePath: "" });
    }
    await serve(dir, args);
    return;
  }
  if (command === "--help" || command === "-h" || command === undefined) {
    console.log(USAGE);
    return;
  }
  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
