import fs from "node:fs";
import path from "node:path";
import type {
  AttackNavigatorLayer,
  ExplorerBundle,
  ExplorerCoverage,
  ExplorerSearchIndex,
} from "@/lib/opentide/types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

function readJson<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function loadBundleSync(): ExplorerBundle {
  return readJson<ExplorerBundle>("explorer.bundle.json");
}

export function loadCoverageSync(): ExplorerCoverage {
  try {
    return readJson<ExplorerCoverage>("explorer.coverage.json");
  } catch {
    return { gaps: [], techniqueMatrix: {}, platformRollup: {} };
  }
}

export function loadSearchSync(): ExplorerSearchIndex {
  try {
    return readJson<ExplorerSearchIndex>("explorer.search.json");
  } catch {
    return { documents: [] };
  }
}

export function loadAttackNavigatorSync(): AttackNavigatorLayer | null {
  try {
    return readJson<AttackNavigatorLayer>("attack-navigator.json");
  } catch {
    return null;
  }
}

export function getAllUuids(bundle: ExplorerBundle): string[] {
  return bundle.summaries.map((s) => s.uuid);
}
