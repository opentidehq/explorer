import { TYPE_PLURALS } from "@/lib/graph/type-icons";

/**
 * The explorer's address: `?o=` the selected object, `?v=` the view (graph when absent),
 * `?q=` the search. Permalink routes (`/threats/<uuid>/`) name the object in the path.
 *
 * Plain functions over an injected location and history, so the browser wiring in
 * explorer-state.tsx stays a few lines and the rules here can run under fake timers.
 */

export const EXPLORER_VIEWS = ["graph", "catalogue", "attack"] as const;
export type ExplorerView = (typeof EXPLORER_VIEWS)[number];

export function isExplorerView(value: unknown): value is ExplorerView {
  return EXPLORER_VIEWS.includes(value as ExplorerView);
}

/** What an address says; `view` is null when it does not say. */
export interface UrlState {
  selectedId: string | null;
  view: ExplorerView | null;
  query: string;
}

/** What a history entry describes: the explorer state the address is written from. */
export interface UrlEntry {
  selectedId: string | null;
  view: ExplorerView;
  query: string;
}

export type LocationLike = Pick<Location, "pathname" | "search">;
export type HistoryLike = Pick<History, "pushState" | "replaceState">;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** `/threats/<uuid>/` and the other permalink routes name an object in the path. */
export const PERMALINK_RE = new RegExp(
  `/(?:${Object.values(TYPE_PLURALS).join("|")})/(${UUID})/?$`,
  "i",
);

export function parseUrl(location: LocationLike): UrlState {
  const params = new URLSearchParams(location.search);
  const view = params.get("v");
  return {
    // An empty `?o=` names nothing: the permalink path still does.
    selectedId:
      params.get("o") || location.pathname.match(PERMALINK_RE)?.[1] || null,
    view: isExplorerView(view) ? view : null,
    query: params.get("q") ?? "",
  };
}

export function basePath(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function urlFor(state: UrlEntry, base = basePath()): string {
  const params = new URLSearchParams();
  if (state.selectedId) params.set("o", state.selectedId);
  if (state.view !== "graph") params.set("v", state.view);
  if (state.query.trim()) params.set("q", state.query.trim());
  const search = params.toString();
  return `${base}/${search ? `?${search}` : ""}`;
}

/**
 * The entry Back or Forward returned to, or null for one the explorer did not write (a
 * fragment, such as the skip link). An address without `v` is the graph, unless its entry
 * recorded another view.
 */
export function entryForPop(
  location: LocationLike,
  historyState: unknown,
): UrlEntry | null {
  if (historyState == null) return null;
  const url = parseUrl(location);
  const recorded = (historyState as { view?: unknown }).view;
  return {
    selectedId: url.selectedId,
    view: url.view ?? (isExplorerView(recorded) ? recorded : "graph"),
    query: url.query,
  };
}

/**
 * Search and view changes reach the address bar after a pause: typing would otherwise write
 * on every key (Next.js adds a write of its own to each), and Safari throws once a page
 * makes 100 history calls in 30 seconds.
 */
export const URL_WRITE_DELAY = 400;

/** Each entry records its view too, for entries whose address has no `v` (the first one). */
function writeHistory(
  history: HistoryLike,
  mode: "push" | "replace",
  view: ExplorerView,
  url?: string,
) {
  try {
    if (mode === "push") history.pushState({ view }, "", url);
    else history.replaceState({ view }, "", url);
  } catch {
    // Safari's rate limit (a SecurityError): the address catches up on the next write.
  }
}

export interface PopStateSource {
  addEventListener(
    type: "popstate",
    listener: (event: { state: unknown }) => void,
  ): void;
  removeEventListener(
    type: "popstate",
    listener: (event: { state: unknown }) => void,
  ): void;
}

export interface UrlSyncOptions {
  /** The explorer state the address describes. */
  read: () => UrlEntry;
  subscribe: (listener: () => void) => () => void;
  /** Show an entry Back or Forward returned to. Its changes are not written back. */
  restore: (entry: UrlEntry) => void;
  /** Whether the corpus has an object, so an entry naming another restores no selection. */
  hasObject: (id: string) => boolean;
  location: LocationLike;
  history: HistoryLike;
  /** Where popstate fires: the window. */
  events: PopStateSource;
  base?: string;
}

/**
 * Keep the address bar in step with the explorer: a new selection is a history entry (Back
 * returns to the previous object); view and search changes update the current one. Returns
 * the cleanup.
 */
export function syncUrl(options: UrlSyncOptions): () => void {
  const { read, history, location } = options;
  const base = options.base ?? basePath();
  // What the current history entry describes.
  let entry = read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let restoring = false;

  // The first entry's address may not say which view it showed (it came from storage).
  writeHistory(history, "replace", entry.view);

  const write = () => {
    clearTimeout(timer);
    timer = undefined;
    const state = read();
    const push = state.selectedId !== entry.selectedId;
    const moved = state.view !== entry.view || state.query !== entry.query;
    if (!push && !moved) return;
    if (push && moved) {
      // A search or view change still waiting to be written belongs to the entry being
      // left: Back returns to it as it was just before this selection.
      writeHistory(
        history,
        "replace",
        state.view,
        urlFor({ ...state, selectedId: entry.selectedId }, base),
      );
    }
    entry = state;
    // Written even when the address stays the same: the entry records the view.
    writeHistory(
      history,
      push ? "push" : "replace",
      state.view,
      urlFor(state, base),
    );
  };

  const unsubscribe = options.subscribe(() => {
    if (restoring) return;
    const state = read();
    if (state.selectedId !== entry.selectedId) write();
    else if (state.view !== entry.view || state.query !== entry.query) {
      clearTimeout(timer);
      timer = setTimeout(write, URL_WRITE_DELAY);
    }
  });

  const onPop = (event: { state: unknown }) => {
    const target = entryForPop(location, event.state);
    if (!target) return;
    clearTimeout(timer);
    timer = undefined;
    const named = target.selectedId;
    // An object this corpus lacks (a link from another build): show none rather than
    // leave the previous selection under an address that names something else.
    if (named && !options.hasObject(named)) target.selectedId = null;
    restoring = true;
    try {
      options.restore(target);
    } finally {
      restoring = false;
    }
    entry = read();
    if (named !== entry.selectedId) {
      writeHistory(history, "replace", entry.view, urlFor(entry, base));
    }
  };
  options.events.addEventListener("popstate", onPop);

  return () => {
    clearTimeout(timer);
    unsubscribe();
    options.events.removeEventListener("popstate", onPop);
  };
}
