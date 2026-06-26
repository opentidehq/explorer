"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AttackNavigatorLayer,
  BundleObjectSummary,
  ExplorerBundle,
  ExplorerCoverage,
  ExplorerSearchIndex,
} from "@/lib/opentide/types";
import { createGraphContext } from "@/lib/opentide/graph";

interface ExplorerContextValue {
  bundle: ExplorerBundle;
  coverage: ExplorerCoverage;
  search: ExplorerSearchIndex;
  attackNavigator: AttackNavigatorLayer | null;
  graphContext: ReturnType<typeof createGraphContext>;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  mode: "catalog" | "graph" | "coverage";
  setMode: (mode: "catalog" | "graph" | "coverage") => void;
  graphSubMode: "detection" | "chaining";
  setGraphSubMode: (mode: "detection" | "chaining") => void;
  breadcrumbs: BundleObjectSummary[];
  pushBreadcrumb: (summary: BundleObjectSummary) => void;
  popBreadcrumb: () => void;
  getSummary: (uuid: string) => BundleObjectSummary | undefined;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  children,
  bundle,
  coverage,
  search,
  attackNavigator,
}: {
  children: ReactNode;
  bundle: ExplorerBundle;
  coverage: ExplorerCoverage;
  search: ExplorerSearchIndex;
  attackNavigator: AttackNavigatorLayer | null;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [mode, setMode] = useState<"catalog" | "graph" | "coverage">("catalog");
  const [graphSubMode, setGraphSubMode] = useState<"detection" | "chaining">(
    "detection",
  );
  const [breadcrumbs, setBreadcrumbs] = useState<BundleObjectSummary[]>([]);

  const graphContext = useMemo(
    () =>
      createGraphContext({
        models: bundle.models,
        flatIndex: bundle.flatIndex,
        chaining: bundle.chaining,
      }),
    [bundle],
  );

  const summaryMap = useMemo(
    () => new Map(bundle.summaries.map((s) => [s.uuid, s])),
    [bundle.summaries],
  );

  const getSummary = useCallback(
    (uuid: string) => summaryMap.get(uuid),
    [summaryMap],
  );

  const pushBreadcrumb = useCallback((summary: BundleObjectSummary) => {
    setBreadcrumbs((prev) => {
      const idx = prev.findIndex((b) => b.uuid === summary.uuid);
      if (idx >= 0) return prev.slice(0, idx + 1);
      return [...prev, summary];
    });
  }, []);

  const popBreadcrumb = useCallback(() => {
    setBreadcrumbs((prev) => prev.slice(0, -1));
  }, []);

  const value: ExplorerContextValue = {
    bundle,
    coverage,
    search,
    attackNavigator,
    graphContext,
    focusId,
    setFocusId,
    mode,
    setMode,
    graphSubMode,
    setGraphSubMode,
    breadcrumbs,
    pushBreadcrumb,
    popBreadcrumb,
    getSummary,
  };

  return (
    <ExplorerContext.Provider value={value}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorer() {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorer must be used within ExplorerProvider");
  return ctx;
}
