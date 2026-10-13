"use client";

import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Catalog } from "@/lib/explorer/catalog";
import { createStore, useStoreSlice, type Store } from "@/lib/explorer/store";
import { expandVisibleIds } from "@/lib/graph/corpus-graph";
import type { GraphLayoutTopology } from "@/lib/graph/render-styles";
import { searchCatalog } from "@/lib/search/engine";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  parseFilterTokens,
  toggleClause,
  type CatalogFilters,
  type RelationMode,
} from "@/lib/search/filters";

export const EXPLORER_VIEWS = ["graph", "catalogue", "attack"] as const;
export type ExplorerView = (typeof EXPLORER_VIEWS)[number];

export const EXPLORER_VIEW_LABELS: Record<ExplorerView, string> = {
  graph: "Graph",
  catalogue: "Catalogue",
  attack: "ATT&CK",
};

export type InspectorTab = "overview" | "links" | "file";

export interface ExplorerState {
  view: ExplorerView;
  selectedId: string | null;
  hoveredId: string | null;
  /** The search box, as typed. */
  query: string;
  filters: CatalogFilters;
  /** Objects the search matched; null without an active search. */
  matchIds: Set<string> | null;
  /** Matches expanded by the relation mode: what the views show. */
  visibleIds: Set<string>;
  topology: GraphLayoutTopology;
  layoutNonce: number;
  killchainGrouping: boolean;
  showVocabNodes: boolean;
  inspectorTab: InspectorTab;
  /** The corpus rail as a drawer (below the desktop breakpoint). */
  railOpen: boolean;
  paletteOpen: boolean;
}

const VIEW_STORAGE_KEY = "opentide.explorer.view";

function readStoredView(): ExplorerView | null {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return EXPLORER_VIEWS.includes(raw as ExplorerView)
      ? (raw as ExplorerView)
      : null;
  } catch {
    return null;
  }
}

function storeView(view: ExplorerView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private mode or storage disabled: the view just is not remembered.
  }
}

/** Search the catalogue and expand matches by the relation mode. */
export function computeVisibility(
  catalog: Catalog,
  filters: CatalogFilters,
): Pick<ExplorerState, "matchIds" | "visibleIds"> {
  if (activeFilterCount(filters) === 0) {
    return {
      matchIds: null,
      visibleIds: new Set(catalog.bundle.summaries.map((s) => s.uuid)),
    };
  }
  const hits = searchCatalog(catalog.search, filters, {
    stagingIndex: catalog.bundle.stagingIndex,
    limit: catalog.bundle.summaries.length,
  });
  const matchIds = new Set(hits.map((hit) => hit.uuid));
  return {
    matchIds,
    visibleIds: expandVisibleIds(
      catalog.corpus,
      matchIds,
      filters.relationMode,
    ),
  };
}

/* URL state ---------------------------------------------------------------------------- */

interface UrlState {
  selectedId: string | null;
  view: ExplorerView | null;
  query: string;
}

/** `/threats/<uuid>/` and the other permalink routes name an object in the path. */
const PERMALINK_RE =
  /\/(?:threats|objectives|signals|rules)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("v");
  return {
    selectedId:
      params.get("o") ??
      window.location.pathname.match(PERMALINK_RE)?.[1] ??
      null,
    view: EXPLORER_VIEWS.includes(view as ExplorerView)
      ? (view as ExplorerView)
      : null,
    query: params.get("q") ?? "",
  };
}

function basePath(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function urlFor(state: Pick<ExplorerState, "selectedId" | "view" | "query">) {
  const params = new URLSearchParams();
  if (state.selectedId) params.set("o", state.selectedId);
  if (state.view !== "graph") params.set("v", state.view);
  if (state.query.trim()) params.set("q", state.query.trim());
  const search = params.toString();
  return `${basePath()}/${search ? `?${search}` : ""}`;
}

/* Actions ------------------------------------------------------------------------------ */

export interface ExplorerActions {
  select: (id: string | null, options?: { tab?: InspectorTab }) => void;
  hover: (id: string | null) => void;
  setView: (view: ExplorerView) => void;
  setQuery: (query: string) => void;
  /** Add or remove one `field:value` token in the search. */
  toggleToken: (field: string, value: string) => void;
  setRelationMode: (mode: RelationMode) => void;
  resetFilters: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setTopology: (topology: GraphLayoutTopology) => void;
  relayout: () => void;
  setKillchainGrouping: (on: boolean) => void;
  setShowVocabNodes: (on: boolean) => void;
  setRailOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
}

const RELATION_TOKENS: Record<RelationMode, string | null> = {
  "include-neighbors": null,
  "match-only": "match-only",
  "include-chain": "chain",
};

function createActions(
  store: Store<ExplorerState>,
  catalog: Catalog,
): ExplorerActions {
  let queryTimer: ReturnType<typeof setTimeout> | undefined;

  const applyQuery = (query: string) => {
    const filters = parseFilterTokens(query);
    store.set({ filters, ...computeVisibility(catalog, filters) });
  };

  const setQuery = (query: string, immediate = false) => {
    store.set({ query });
    clearTimeout(queryTimer);
    if (immediate) applyQuery(query);
    else queryTimer = setTimeout(() => applyQuery(query), 140);
  };

  return {
    select(id, options) {
      if (id && !catalog.summaries.has(id)) return;
      store.set((state) => ({
        selectedId: id,
        inspectorTab:
          options?.tab ??
          (id === state.selectedId ? state.inspectorTab : "overview"),
      }));
    },
    hover(id) {
      store.set({ hoveredId: id });
    },
    setView(view) {
      storeView(view);
      store.set({ view, hoveredId: null });
    },
    setQuery: (query) => setQuery(query),
    toggleToken(field, value) {
      setQuery(toggleClause(store.get().query, field, value), true);
    },
    setRelationMode(mode) {
      const stripped = store
        .get()
        .query.replace(
          /(^|\s)(match-only|matches|match|neighbors?|chain|detection-chain|(relation|mode):\S+)(?=\s|$)/gi,
          " ",
        )
        .replace(/\s+/g, " ")
        .trim();
      const token = RELATION_TOKENS[mode];
      setQuery(token ? `${stripped} ${token}`.trim() : stripped, true);
    },
    resetFilters() {
      setQuery("", true);
    },
    setInspectorTab(tab) {
      store.set({ inspectorTab: tab });
    },
    setTopology(topology) {
      store.set({ topology });
    },
    relayout() {
      store.set((state) => ({ layoutNonce: state.layoutNonce + 1 }));
    },
    setKillchainGrouping(on) {
      store.set({ killchainGrouping: on });
    },
    setShowVocabNodes(on) {
      store.set({ showVocabNodes: on });
    },
    setRailOpen(open) {
      store.set({ railOpen: open });
    },
    setPaletteOpen(open) {
      store.set({ paletteOpen: open });
    },
  };
}

/* Provider ----------------------------------------------------------------------------- */

interface ExplorerContextValue {
  catalog: Catalog;
  store: Store<ExplorerState>;
  actions: ExplorerActions;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  catalog,
  initialId,
  children,
}: {
  catalog: Catalog;
  /** The object a permalink route opens on. */
  initialId?: string;
  children: ReactNode;
}) {
  const [value] = useState<ExplorerContextValue>(() => {
    const url = typeof window === "undefined" ? null : readUrl();
    const query = url?.query ?? "";
    const filters = parseFilterTokens(query);
    const requested = url?.selectedId ?? initialId ?? null;
    const store = createStore<ExplorerState>({
      view:
        url?.view ??
        (typeof window === "undefined" ? null : readStoredView()) ??
        "graph",
      selectedId:
        requested && catalog.summaries.has(requested) ? requested : null,
      hoveredId: null,
      query,
      filters,
      ...computeVisibility(catalog, query ? filters : DEFAULT_FILTERS),
      topology: "force",
      layoutNonce: 0,
      killchainGrouping: false,
      showVocabNodes: false,
      inspectorTab: "overview",
      railOpen: false,
      paletteOpen: false,
    });
    return { catalog, store, actions: createActions(store, catalog) };
  });

  // Keep the address bar in step: a new selection is a history entry (Back returns to the
  // previous object); view and search changes replace the current one.
  useEffect(() => {
    const { store, actions } = value;
    let last = store.get();
    let restoring = false;

    const unsubscribe = store.subscribe(() => {
      const state = store.get();
      const moved =
        state.selectedId !== last.selectedId ||
        state.view !== last.view ||
        state.query !== last.query;
      if (moved && !restoring) {
        const url = urlFor(state);
        if (url !== `${window.location.pathname}${window.location.search}`) {
          if (state.selectedId !== last.selectedId) {
            window.history.pushState({ explorer: true }, "", url);
          } else {
            window.history.replaceState({ explorer: true }, "", url);
          }
        }
      }
      last = state;
    });

    const onPop = () => {
      const url = readUrl();
      restoring = true;
      actions.select(url.selectedId);
      if (url.view) actions.setView(url.view);
      if (url.query !== store.get().query) actions.setQuery(url.query);
      restoring = false;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPop);
    };
  }, [value]);

  return <ExplorerContext value={value}>{children}</ExplorerContext>;
}

function useExplorerContext(): ExplorerContextValue {
  const ctx = use(ExplorerContext);
  if (!ctx)
    throw new Error("Explorer hooks must be used within ExplorerProvider");
  return ctx;
}

export function useCatalog(): Catalog {
  return useExplorerContext().catalog;
}

export function useExplorerActions(): ExplorerActions {
  return useExplorerContext().actions;
}

/** Subscribe to one slice of explorer state. */
export function useExplorer<T>(selector: (state: ExplorerState) => T): T {
  return useStoreSlice(useExplorerContext().store, selector);
}

/** The store itself, for imperative reads in event handlers and effects. */
export function useExplorerStore(): Store<ExplorerState> {
  return useExplorerContext().store;
}

/** Visible ids with the selection (and what it touches) forced into view. */
export function useDisplayedIds(): Set<string> {
  const visibleIds = useExplorer((s) => s.visibleIds);
  const selectedId = useExplorer((s) => s.selectedId);
  return useMemo(() => {
    if (!selectedId || visibleIds.has(selectedId)) return visibleIds;
    const next = new Set(visibleIds);
    next.add(selectedId);
    return next;
  }, [selectedId, visibleIds]);
}
