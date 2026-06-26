import { Data, Effect } from "effect";
import type {
  AttackNavigatorLayer,
  ExplorerBundle,
  ExplorerCoverage,
  ExplorerSearchIndex,
} from "@/lib/opentide/types";

export class DataLoadError extends Data.TaggedError("DataLoadError")<{
  readonly message: string;
  readonly path?: string;
}> {}

const dataBase = () =>
  process.env.NEXT_PUBLIC_BASE_PATH
    ? `${process.env.NEXT_PUBLIC_BASE_PATH}/data`
    : "/data";

async function fetchJson<T>(filename: string): Promise<T> {
  const res = await fetch(`${dataBase()}/${filename}`);
  if (!res.ok) {
    throw new DataLoadError({
      message: `Failed to load ${filename}: ${res.status}`,
      path: filename,
    });
  }
  return (await res.json()) as T;
}

export const loadBundle = Effect.tryPromise({
  try: () => fetchJson<ExplorerBundle>("explorer.bundle.json"),
  catch: (e) =>
    e instanceof DataLoadError
      ? e
      : new DataLoadError({ message: String(e), path: "explorer.bundle.json" }),
});

export const loadSearchIndex = Effect.tryPromise({
  try: () => fetchJson<ExplorerSearchIndex>("explorer.search.json"),
  catch: (e) =>
    e instanceof DataLoadError
      ? e
      : new DataLoadError({ message: String(e), path: "explorer.search.json" }),
});

export const loadCoverage = Effect.tryPromise({
  try: () => fetchJson<ExplorerCoverage>("explorer.coverage.json"),
  catch: (e) =>
    e instanceof DataLoadError
      ? e
      : new DataLoadError({
          message: String(e),
          path: "explorer.coverage.json",
        }),
});

export const loadAttackNavigator = Effect.tryPromise({
  try: () => fetchJson<AttackNavigatorLayer>("attack-navigator.json"),
  catch: (e) =>
    e instanceof DataLoadError
      ? e
      : new DataLoadError({
          message: String(e),
          path: "attack-navigator.json",
        }),
});

export function getObjectName(body: Record<string, unknown>): string {
  if (typeof body["name"] === "string") return body["name"];
  const metadata = body["metadata"] as Record<string, unknown> | undefined;
  return (metadata?.["uuid"] as string) ?? "Unknown";
}

export function getObjectUuid(body: Record<string, unknown>): string | null {
  const metadata = body["metadata"] as Record<string, unknown> | undefined;
  const uuid = metadata?.["uuid"];
  return typeof uuid === "string" ? uuid : null;
}
