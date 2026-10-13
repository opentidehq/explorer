import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the module at `moduleUrl` is the script node was started with, so a script can
 * also be imported (by tests) without running. Compares real paths: package bins run through
 * symlinks, macOS `/tmp` is one, and URLs escape spaces.
 * @param {string} moduleUrl `import.meta.url`
 * @returns {boolean}
 */
export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
