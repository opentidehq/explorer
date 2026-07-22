"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  BundleObjectSummary,
  ExplorerBundle,
  ExplorerSearchIndex,
} from "@/lib/opentide/types";
import { enrichBundle, enrichSearchIndex } from "@/lib/opentide/enrich-bundle";
import { createGraphContext } from "@/lib/opentide/graph";
import {
  buildCorpusGraph,
  expandVisibleIds,
  type CorpusGraph,
} from "@/lib/graph/corpus-graph";
import {
  DEFAULT_GRAPH_TOPOLOGY,
  type GraphTopologySettings,
} from "@/lib/graph/render-styles";
import { DEFAULT_FILTERS, type CatalogFilters } from "@/lib/search/filters";
import { buildOramaIndex, searchCatalog } from "@/lib/search/orama";
import {
  buildTokenVocabulary,
  enrichTokenVocabulary,
  type TokenVocabulary,
} from "@/lib/search/token-catalog";
import type { VocabIndex } from "@/lib/opentide/vocab";
import {
  subscribeExplorerView,
  getExplorerViewSnapshot,
  writeStoredExplorerView,
  type ExplorerView,
} from "@/lib/graph/explorer-view";

interface ExplorerContextValue {
  bundle: ExplorerBundle;
  search: ExplorerSearchIndex;
  graphContext: ReturnType<typeof createGraphContext>;
  corpusGraph: CorpusGraph;
  tokenVocabulary: TokenVocabulary;
  filters: CatalogFilters;
  setFilters: (filters: CatalogFilters) => void;
  resetFilters: () => void;
  visibleIds: Set<string>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  getSummary: (uuid: string) => BundleObjectSummary | undefined;
  isSearching: boolean;
  matchCount: number;
  graphTopology: GraphTopologySettings;
  setGraphTopology: (
    updater: (prev: GraphTopologySettings) => GraphTopologySettings,
  ) => void;
  layoutNonce: number;
  requestGraphRelayout: () => void;
  killchainGrouping: boolean;
  setKillchainGrouping: (value: boolean) => void;
  showVocabNodes: boolean;
  setShowVocabNodes: (value: boolean) => void;
  vocabIndex: VocabIndex;
  explorerView: ExplorerView;
  setExplorerView: (view: ExplorerView) => void;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  children,
  bundle: rawBundle,
  search: rawSearch,
  vocabIndex,
}: {
  children: ReactNode;
  bundle: ExplorerBundle;
  search: ExplorerSearchIndex;
  vocabIndex: VocabIndex;
}) {
  const bundle = useMemo(() => enrichBundle(rawBundle), [rawBundle]);
  const search = useMemo(
    () => enrichSearchIndex(bundle, rawSearch),
    [bundle, rawSearch],
  );

  const [filters, setFiltersState] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set(bundle.summaries.map((s) => s.uuid)),
  );
  const [isSearching, setIsSearching] = useState(false);
  const [matchCount, setMatchCount] = useState(bundle.summaries.length);
  const [graphTopology, setGraphTopologyState] =
    useState<GraphTopologySettings>(() => ({ ...DEFAULT_GRAPH_TOPOLOGY }));
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [killchainGrouping, setKillchainGrouping] = useState(false);
  const [showVocabNodes, setShowVocabNodes] = useState(false);
  const explorerView = useSyncExternalStore(
    subscribeExplorerView,
    getExplorerViewSnapshot,
    () => "graph" as ExplorerView,
  );

  const setExplorerView = useCallback((view: ExplorerView) => {
    writeStoredExplorerView(view);
  }, []);

  const setGraphTopology = useCallback(
    (updater: (prev: GraphTopologySettings) => GraphTopologySettings) => {
      setGraphTopologyState(updater);
    },
    [],
  );

  const requestGraphRelayout = useCallback(() => {
    setLayoutNonce((nonce) => nonce + 1);
  }, []);

  const oramaDbRef = useRef<Awaited<ReturnType<typeof buildOramaIndex>> | null>(
    null,
  );
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

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

  const tokenVocabulary = useMemo(
    () => enrichTokenVocabulary(buildTokenVocabulary(bundle), vocabIndex),
    [bundle, vocabIndex],
  );

  const summaryMap = useMemo(
    () => new Map(bundle.summaries.map((s) => [s.uuid, s])),
    [bundle.summaries],
  );

  const getSummary = useCallback(
    (uuid: string) => summaryMap.get(uuid),
    [summaryMap],
  );

  const setFilters = useCallback((next: CatalogFilters) => {
    setFiltersState(next);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    buildOramaIndex(search.documents).then((db) => {
      if (!cancelled) oramaDbRef.current = db;
    });
    return () => {
      cancelled = true;
    };
  }, [search.documents]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const active = filtersRef.current;
      const hasActiveFilters =
        active.query ||
        active.uuid ||
        active.types.length > 0 ||
        active.platforms.length > 0 ||
        active.statuses.length > 0 ||
        active.techniques.length > 0 ||
        active.actors.length > 0 ||
        active.schemas.length > 0 ||
        active.tlps.length > 0 ||
        active.stagingOnly ||
        active.productionOnly;

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

      let db = oramaDbRef.current;
      if (!db) {
        db = await buildOramaIndex(search.documents);
        oramaDbRef.current = db;
      }

      const hits = await searchCatalog(db, active, {
        stagingIndex: bundle.stagingIndex,
        limit: bundle.summaries.length,
        documents: search.documents,
      });

      const seed = new Set(hits.map((h) => h.uuid));
      const expanded = expandVisibleIds(corpusGraph, seed, active.relationMode);

      if (!cancelled) {
        setVisibleIds(expanded);
        setMatchCount(seed.size);
        setIsSearching(false);
      }
    }

    const timer = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, search.documents, bundle, corpusGraph]);

  const selectObject = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) return;

      setVisibleIds((prev) => {
        const next = new Set(prev);
        let changed = false;

        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }

        for (const edge of corpusGraph.edges) {
          if (edge.kind !== "chaining") continue;
          if (edge.source !== id && edge.target !== id) continue;
          if (!next.has(edge.source)) {
            next.add(edge.source);
            changed = true;
          }
          if (!next.has(edge.target)) {
            next.add(edge.target);
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    },
    [corpusGraph.edges],
  );

  const value = useMemo<ExplorerContextValue>(
    () => ({
      bundle,
      search,
      graphContext,
      corpusGraph,
      tokenVocabulary,
      filters,
      setFilters,
      resetFilters,
      visibleIds,
      selectedId,
      setSelectedId: selectObject,
      hoveredId,
      setHoveredId,
      getSummary,
      isSearching,
      matchCount,
      graphTopology,
      setGraphTopology,
      layoutNonce,
      requestGraphRelayout,
      killchainGrouping,
      setKillchainGrouping,
      showVocabNodes,
      setShowVocabNodes,
      vocabIndex,
      explorerView,
      setExplorerView,
    }),
    [
      bundle,
      search,
      graphContext,
      corpusGraph,
      tokenVocabulary,
      filters,
      setFilters,
      resetFilters,
      visibleIds,
      selectedId,
      selectObject,
      hoveredId,
      getSummary,
      isSearching,
      matchCount,
      graphTopology,
      setGraphTopology,
      layoutNonce,
      requestGraphRelayout,
      killchainGrouping,
      showVocabNodes,
      vocabIndex,
      explorerView,
      setExplorerView,
    ],
  );

  return (
    <ExplorerContext.Provider value={value}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorer() {
  const ctx = use(ExplorerContext);
  if (!ctx) throw new Error("useExplorer must be used within ExplorerProvider");
  return ctx;
}
