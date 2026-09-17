"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Compass } from "lucide-react";
import { ExplorerProvider } from "@/components/shell/explorer-context";
import { loadCatalog, type CatalogPayload } from "@/lib/data/catalog";

const catalogPromise = typeof window === "undefined" ? null : loadCatalog();

export function ExplorerBootstrap({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (catalogPromise ?? loadCatalog())
      .then((payload) => {
        if (!cancelled) setCatalog(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load catalogue",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <p className="max-w-md px-6 text-center text-sm text-muted-foreground">
          {error}
        </p>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Compass className="h-4 w-4 text-primary" aria-hidden />
          Loading catalogue…
        </div>
      </div>
    );
  }

  return (
    <ExplorerProvider
      bundle={catalog.bundle}
      search={catalog.search}
      vocabIndex={catalog.vocabIndex}
    >
      {children}
    </ExplorerProvider>
  );
}
