"use client";

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { OpentideMark } from "@/components/brand/opentide-mark";
import { AppShell } from "@/components/explorer/app-shell";
import { ExplorerProvider } from "@/components/explorer/explorer-state";
import { LoadingScreen } from "@/components/explorer/loading-screen";
import { loadCatalog, type CatalogPayload } from "@/lib/data/catalog";
import { buildCatalog, type Catalog } from "@/lib/explorer/catalog";

// Start fetching as soon as this module evaluates, before React hydrates. The layout also
// preloads both files, so the request is usually already in flight.
let pending: Promise<CatalogPayload> | null =
  typeof window === "undefined" ? null : loadCatalog();

/**
 * Wait for the next paint, so a status message shows before synchronous work. Hidden tabs do
 * not paint (requestAnimationFrame never fires there): fall back to a timer so a library
 * opened in a background tab is ready when the reader switches to it.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

type LoadState =
  | { stage: "fetching" | "indexing" }
  | { stage: "ready"; catalog: Catalog }
  | { stage: "error"; message: string };

export function ExplorerApp({ initialId }: { initialId?: string }) {
  const [state, setState] = useState<LoadState>({ stage: "fetching" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await (pending ?? (pending = loadCatalog()));
        if (cancelled) return;
        setState({ stage: "indexing" });
        // Let the indexing message paint before the synchronous build.
        await nextPaint();
        const catalog = buildCatalog(payload.bundle, payload.vocabIndex);
        if (!cancelled) setState({ stage: "ready", catalog });
      } catch (error) {
        pending = null;
        if (!cancelled) {
          setState({
            stage: "error",
            message:
              error instanceof Error
                ? error.message
                : "The catalogue failed to load.",
          });
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.stage === "ready") {
    return (
      <ExplorerProvider catalog={state.catalog} initialId={initialId}>
        <AppShell />
      </ExplorerProvider>
    );
  }

  if (state.stage === "error") {
    return (
      <div className="flex h-dvh items-center justify-center bg-band px-6">
        <div className="tide-panel flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <OpentideMark size={40} />
          <div>
            <p className="font-mono text-[11px] text-subtle">
              catalogue unavailable
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-[-0.01em]">
              The library could not be loaded
            </h1>
            <p className="mt-2 text-sm text-muted">{state.message}</p>
          </div>
          <button
            type="button"
            className="tide-btn-primary"
            onClick={() => {
              setState({ stage: "fetching" });
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <LoadingScreen stage={state.stage} />;
}
