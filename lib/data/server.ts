import fs from "node:fs";
import path from "node:path";
import { normalizeExplorerBundle } from "@/lib/data/catalog";
import { extractObjectDescription } from "@/lib/opentide/object-description";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  RawExplorerBundle,
} from "@/lib/opentide/types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

let cached: ExplorerBundle | null = null;

/**
 * Build-time only: route params and per-object metadata. Never pass this into client
 * components — the client fetches the catalogue from `/data`.
 */
export function loadBundleSync(): ExplorerBundle {
  if (!cached) {
    const file = path.join(DATA_DIR, "explorer.bundle.json");
    cached = normalizeExplorerBundle(
      JSON.parse(fs.readFileSync(file, "utf8")) as RawExplorerBundle,
    );
  }
  return cached;
}

/** A summary and a one-paragraph plain-text description, for page metadata. */
export function objectMetadataSync(
  uuid: string,
): { summary: BundleObjectSummary; description: string | null } | null {
  const bundle = loadBundleSync();
  const summary = bundle.summaries.find((s) => s.uuid === uuid);
  if (!summary) return null;
  const raw = extractObjectDescription(bundle.flatIndex[uuid]);
  const description = raw
    ? raw
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_`#>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280)
    : null;
  return { summary, description };
}
