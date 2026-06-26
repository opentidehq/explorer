"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  ExplorerSearchIndex,
} from "@/lib/opentide/types";
import { createGraphContext } from "@/lib/opentide/graph";
import {
  buildCorpusGraph,
  expandVisibleIds,
  filterGraph,
  type CorpusGraph,
} from "@/lib/graph/corpus-graph";
import { DEFAULT_FILTERS, type CatalogFilters } from "@/lib/search/filters";
import { buildOramaIndex, searchCatalog } from "@/lib/search/orama";

interface ExplorerContextValue {
  bundle: ExplorerBundle;
  search: ExplorerSearchIndex;
  graphContext: ReturnType<typeof createGraphContext>;
  corpusGraph: CorpusGraph;
  filters: CatalogFilters;
  setFilters: (patch: Partial<CatalogFilters>) => void;
  resetFilters: () => void;
  visibleIds: Set<string>;
  filteredGraph: ReturnType<typeof filterGraph>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  getSummary: (uuid: string) => BundleObjectSummary | undefined;
  isSearching: boolean;
  matchCount: number;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  children,
  bundle,
  search,
}: {
  children: ReactNode;
  bundle: ExplorerBundle;
  search: ExplorerSearchIndex;
}) {
  const [filters, setFiltersState] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set(bundle.summaries.map((s) => s.uuid)),
  );
  const [isSearching, setIsSearching] = useState(false);
  const [matchCount, setMatchCount] = useState(bundle.summaries.length);

  const graphContext = useMemo(
    () =>
      createGraphContext({
        models: bundle.models,
        flatIndex: bundle.flatIndex,
        chaining: bundle.chaining,
      }),
    [bundle],
  );

  const corpusGraph = useMemo(() => buildCorpusGraph(bundle), [bundle]);

  const summaryMap = useMemo(
    () => new Map(bundle.summaries.map((s) => [s.uuid, s])),
    [bundle.summaries],
  );

  const getSummary = useCallback(
    (uuid: string) => summaryMap.get(uuid),
    [summaryMap],
  );

  const setFilters = useCallback((patch: Partial<CatalogFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const hasActiveFilters =
        filters.query ||
        filters.uuid ||
        filters.types.length ||
        filters.platforms.length ||
        filters.statuses.length ||
        filters.techniques.length ||
        filters.actors.length ||
        filters.stagingOnly ||
        filters.productionOnly;

      if (!hasActiveFilters) {
        const all = new Set(bundle.summaries.map((s) => s.uuid));
        if (!cancelled) {
          setVisibleIds(all);
          setMatchCount(all.size);
          setIsSearching(false);
        }
        return;
      }

      setIsSearching(true);
      const db = await buildOramaIndex(search.documents);
      const hits = await searchCatalog(db, filters, {
        stagingIndex: bundle.stagingIndex,
        limit: bundle.summaries.length,
      });

      const seed = new Set(hits.map((h) => h.uuid));
      const expanded = expandVisibleIds(
        corpusGraph,
        seed,
        filters.relationMode,
      );

      if (!cancelled) {
        setVisibleIds(expanded);
        setMatchCount(seed.size);
        setIsSearching(false);
      }
    }

    const timer = setTimeout(run, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, search.documents, bundle, corpusGraph]);

  const filteredGraph = useMemo(
    () => filterGraph(corpusGraph, visibleIds),
    [corpusGraph, visibleIds],
  );

  const value: ExplorerContextValue = {
    bundle,
    search,
    graphContext,
    corpusGraph,
    filters,
    setFilters,
    resetFilters,
    visibleIds,
    filteredGraph,
    selectedId,
    setSelectedId,
    getSummary,
    isSearching,
    matchCount,
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
