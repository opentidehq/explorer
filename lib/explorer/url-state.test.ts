import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "@/lib/explorer/store";
import {
  PERMALINK_RE,
  URL_WRITE_DELAY,
  basePath,
  entryForPop,
  parseUrl,
  syncUrl,
  urlFor,
  type ExplorerView,
  type HistoryLike,
  type PopStateSource,
  type UrlEntry,
} from "@/lib/explorer/url-state";
import { TYPE_PLURALS } from "@/lib/graph/type-icons";

const A = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
const B = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
/** Well formed, but not in this corpus (a link from another build). */
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

const at = (href: string) => {
  const url = new URL(href, "https://explorer.test");
  return { pathname: url.pathname, search: url.search };
};

describe("parseUrl", () => {
  it("reads the selection, view and search from the query", () => {
    expect(parseUrl(at(`/?o=${A}&v=attack&q=actor:APT29`))).toEqual({
      selectedId: A,
      view: "attack",
      query: "actor:APT29",
    });
  });

  it("leaves out what the address does not say, and views it does not know", () => {
    expect(parseUrl(at("/?v=timeline"))).toEqual({
      selectedId: null,
      view: null,
      query: "",
    });
  });

  it("reads the object from each permalink route, under a base path too", () => {
    for (const plural of Object.values(TYPE_PLURALS)) {
      expect(parseUrl(at(`/${plural}/${A}/`)).selectedId).toBe(A);
      expect(parseUrl(at(`/library/${plural}/${A}`)).selectedId).toBe(A);
    }
    expect(parseUrl(at(`/threats/${A.toUpperCase()}/`)).selectedId).toBe(
      A.toUpperCase(),
    );
    expect(parseUrl(at(`/actors/${A}/`)).selectedId).toBeNull();
    expect(parseUrl(at("/threats/not-a-uuid/")).selectedId).toBeNull();
  });

  it("prefers `o` over the permalink path", () => {
    expect(parseUrl(at(`/threats/${A}/?o=${B}`)).selectedId).toBe(B);
  });

  it("falls back to the permalink path when `o` is empty", () => {
    expect(parseUrl(at(`/threats/${A}/?o=`)).selectedId).toBe(A);
    expect(parseUrl(at("/?o=")).selectedId).toBeNull();
  });
});

describe("PERMALINK_RE", () => {
  it("covers every type's route and nothing else", () => {
    expect(PERMALINK_RE.source).toContain(
      Object.values(TYPE_PLURALS).join("|"),
    );
    expect(PERMALINK_RE.test(`/threat/${A}/`)).toBe(false);
    expect(PERMALINK_RE.test(`/rules/${A}/extra`)).toBe(false);
  });
});

describe("urlFor", () => {
  it("writes only what differs from the default explorer", () => {
    expect(urlFor({ selectedId: null, view: "graph", query: "" }, "")).toBe(
      "/",
    );
    expect(
      urlFor({ selectedId: A, view: "catalogue", query: "  apt  " }, ""),
    ).toBe(`/?o=${A}&v=catalogue&q=apt`);
    expect(urlFor({ selectedId: null, view: "graph", query: "  " }, "")).toBe(
      "/",
    );
  });

  it("round-trips through parseUrl", () => {
    const state: UrlEntry = {
      selectedId: B,
      view: "attack",
      query: "type:rule status!=STAGING",
    };
    expect(parseUrl(at(urlFor(state, "/library")))).toEqual(state);
  });

  it("prefixes the base path", () => {
    expect(
      urlFor({ selectedId: A, view: "graph", query: "" }, "/library"),
    ).toBe(`/library/?o=${A}`);
  });
});

describe("basePath", () => {
  const previous = process.env.NEXT_PUBLIC_BASE_PATH;
  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = previous;
  });

  it("drops a trailing slash, and is empty without one set", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/library/";
    expect(basePath()).toBe("/library");
    expect(urlFor({ selectedId: null, view: "graph", query: "" })).toBe(
      "/library/",
    );
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    expect(basePath()).toBe("");
  });
});

describe("entryForPop", () => {
  it("ignores entries the explorer did not write", () => {
    expect(entryForPop(at(`/?o=${A}`), null)).toBeNull();
    expect(entryForPop(at(`/?o=${A}`), undefined)).toBeNull();
  });

  it("takes the view from the address, then from the entry, then the graph", () => {
    expect(entryForPop(at("/?v=attack"), { view: "catalogue" })?.view).toBe(
      "attack",
    );
    expect(entryForPop(at("/"), { view: "catalogue" })?.view).toBe("catalogue");
    expect(entryForPop(at("/"), { view: "timeline" })?.view).toBe("graph");
    expect(entryForPop(at("/"), {})?.view).toBe("graph");
  });
});

/* syncUrl ------------------------------------------------------------------------------ */

type PopListener = (event: { state: unknown }) => void;

/** A history stack with a location that follows it, firing popstate on Back and Forward. */
function fakeBrowser(start: string, startState: unknown = null) {
  const entries = [
    { url: new URL(start, "https://explorer.test"), state: startState },
  ];
  let index = 0;
  const listeners = new Set<PopListener>();
  const current = () => entries[index]!;
  const resolve = (url?: string | URL | null) =>
    url == null ? current().url : new URL(url, current().url);

  const history = {
    pushState: vi.fn<HistoryLike["pushState"]>((state, _unused, url) => {
      const next = { url: resolve(url), state: state as unknown };
      entries.splice(index + 1, entries.length, next);
      index += 1;
    }),
    replaceState: vi.fn<HistoryLike["replaceState"]>((state, _unused, url) => {
      entries[index] = { url: resolve(url), state: state as unknown };
    }),
  } satisfies HistoryLike;

  const events: PopStateSource = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };

  const go = (delta: number) => {
    index += delta;
    for (const listener of listeners) listener({ state: current().state });
  };

  return {
    location: {
      get pathname() {
        return current().url.pathname;
      },
      get search() {
        return current().url.search;
      },
    },
    history,
    events,
    listeners,
    back: () => go(-1),
    forward: () => go(1),
    /** A fragment link (the skip link): an entry with no state, written by the browser. */
    followFragment(hash: string) {
      entries.splice(index + 1, entries.length, {
        url: new URL(hash, current().url),
        state: null,
      });
      index += 1;
    },
    get address() {
      return current().url.pathname + current().url.search;
    },
    get state() {
      return current().state;
    },
    get length() {
      return entries.length;
    },
  };
}

/** syncUrl over a store, restoring the way the explorer's actions do. */
function mount(
  start: string,
  options: { view?: ExplorerView; startState?: unknown } = {},
) {
  const known = new Set([A, B]);
  const browser = fakeBrowser(start, options.startState);
  const url = parseUrl(browser.location);
  const store = createStore<UrlEntry>({
    selectedId:
      url.selectedId && known.has(url.selectedId) ? url.selectedId : null,
    view: url.view ?? options.view ?? "graph",
    query: url.query,
  });
  // As ExplorerActions.select: an object the corpus lacks is not selected.
  const select = (id: string | null) => {
    if (id && !known.has(id)) return;
    store.set({ selectedId: id });
  };
  const restore = vi.fn<(entry: UrlEntry) => void>((entry) => {
    select(entry.selectedId);
    store.set({ view: entry.view });
    if (entry.query !== store.get().query) store.set({ query: entry.query });
  });
  const cleanup = syncUrl({
    read: store.get,
    subscribe: store.subscribe,
    restore,
    hasObject: (id) => known.has(id),
    location: browser.location,
    history: browser.history,
    events: browser.events,
    base: "",
  });
  browser.history.pushState.mockClear();
  browser.history.replaceState.mockClear();
  return { browser, store, select, restore, cleanup };
}

describe("syncUrl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the first entry's view without changing its address", () => {
    const browser = fakeBrowser(`/threats/${A}/`);
    const store = createStore<UrlEntry>({
      selectedId: A,
      view: "catalogue",
      query: "",
    });
    syncUrl({
      read: store.get,
      subscribe: store.subscribe,
      restore: () => {},
      hasObject: () => true,
      ...browser,
      base: "",
    });

    expect(browser.history.replaceState).toHaveBeenCalledWith(
      { view: "catalogue" },
      "",
      undefined,
    );
    expect(browser.address).toBe(`/threats/${A}/`);
    expect(browser.history.pushState).not.toHaveBeenCalled();
  });

  it("pushes an entry for a new selection, at once", () => {
    const { browser, select } = mount("/");

    select(A);

    expect(browser.history.pushState).toHaveBeenCalledTimes(1);
    expect(browser.address).toBe(`/?o=${A}`);
    expect(browser.state).toEqual({ view: "graph" });
    expect(browser.length).toBe(2);

    select(B);
    expect(browser.length).toBe(3);
    expect(browser.address).toBe(`/?o=${B}`);
  });

  it("replaces the entry after a pause for view and search changes", () => {
    const { browser, store } = mount("/");

    store.set({ query: "a" });
    store.set({ query: "ap" });
    vi.advanceTimersByTime(URL_WRITE_DELAY - 100);
    store.set({ query: "apt" });
    vi.advanceTimersByTime(URL_WRITE_DELAY - 1);
    // The pause restarts with each change.
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser.address).toBe("/");

    vi.advanceTimersByTime(1);
    expect(browser.history.replaceState).toHaveBeenCalledTimes(1);
    expect(browser.address).toBe("/?q=apt");

    store.set({ view: "attack" });
    vi.advanceTimersByTime(URL_WRITE_DELAY);
    expect(browser.address).toBe("/?v=attack&q=apt");
    expect(browser.state).toEqual({ view: "attack" });
    expect(browser.history.pushState).not.toHaveBeenCalled();
    expect(browser.length).toBe(1);
  });

  it("writes nothing when a change is undone before the pause ends", () => {
    const { browser, store } = mount("/?q=apt");

    store.set({ query: "apt29" });
    store.set({ query: "apt" });
    vi.advanceTimersByTime(URL_WRITE_DELAY);

    expect(browser.history.replaceState).not.toHaveBeenCalled();
  });

  it("writes a pending search to the entry being left before pushing a selection", () => {
    const { browser, store, select } = mount("/");

    store.set({ query: "apt" });
    select(A);

    expect(browser.history.replaceState).toHaveBeenCalledTimes(1);
    expect(
      browser.history.replaceState.mock.invocationCallOrder[0],
    ).toBeLessThan(browser.history.pushState.mock.invocationCallOrder[0]!);
    expect(browser.address).toBe(`/?o=${A}&q=apt`);

    // The pending write was the one just made: nothing follows.
    vi.advanceTimersByTime(URL_WRITE_DELAY);
    expect(browser.history.replaceState).toHaveBeenCalledTimes(1);

    browser.back();
    expect(browser.address).toBe("/?q=apt");
    expect(store.get()).toEqual({
      selectedId: null,
      view: "graph",
      query: "apt",
    });
  });

  it("restores the view recorded in an entry whose address has none", () => {
    // The first view came from storage, so the address does not name it.
    const { browser, store, select } = mount("/", { view: "catalogue" });

    select(A);
    store.set({ view: "graph" });
    vi.advanceTimersByTime(URL_WRITE_DELAY);
    expect(browser.address).toBe(`/?o=${A}`);

    browser.back();
    expect(browser.address).toBe("/");
    expect(store.get()).toEqual({
      selectedId: null,
      view: "catalogue",
      query: "",
    });

    browser.forward();
    expect(store.get()).toEqual({ selectedId: A, view: "graph", query: "" });
  });

  it("does not write back what it restores", () => {
    const { browser, select, store } = mount("/");
    select(A);
    store.set({ query: "apt" });
    vi.advanceTimersByTime(URL_WRITE_DELAY);
    browser.history.pushState.mockClear();
    browser.history.replaceState.mockClear();

    browser.back();
    vi.advanceTimersByTime(URL_WRITE_DELAY);
    browser.forward();
    vi.advanceTimersByTime(URL_WRITE_DELAY);

    expect(store.get()).toEqual({ selectedId: A, view: "graph", query: "apt" });
    expect(browser.history.pushState).not.toHaveBeenCalled();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser.length).toBe(2);
  });

  it("drops a pending write when Back moves to another entry", () => {
    const { browser, select, store } = mount("/");
    select(A);
    store.set({ query: "typed after selecting" });

    browser.back();
    vi.advanceTimersByTime(URL_WRITE_DELAY);

    // Neither the entry left nor the one restored takes the unwritten search.
    expect(browser.address).toBe("/");
    expect(store.get().query).toBe("");
    browser.forward();
    expect(browser.address).toBe(`/?o=${A}`);
  });

  it("ignores fragment entries", () => {
    const { browser, restore, select, store } = mount("/");
    select(A);
    browser.followFragment("#main");
    browser.back();
    expect(restore).toHaveBeenCalledTimes(1);

    // Forward to the fragment: the explorer did not change, so nothing is restored.
    browser.forward();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(store.get().selectedId).toBe(A);
  });

  it("clears the selection, and the address, on an entry naming an unknown object", () => {
    // An address from another build of the corpus.
    const { browser, select, store } = mount(`/?o=${UNKNOWN}&v=catalogue`, {
      startState: { view: "catalogue" },
    });
    expect(store.get().selectedId).toBeNull();
    select(A);

    browser.back();

    expect(store.get()).toEqual({
      selectedId: null,
      view: "catalogue",
      query: "",
    });
    // The entry now says what the explorer shows.
    expect(browser.address).toBe("/?v=catalogue");
    expect(browser.length).toBe(2);
  });

  it("survives a refused history call and catches up on the next write", () => {
    const { browser, select } = mount("/");
    browser.history.pushState.mockImplementationOnce(() => {
      throw new DOMException("Too many calls", "SecurityError");
    });

    expect(() => select(A)).not.toThrow();
    expect(browser.address).toBe("/");

    select(B);
    expect(browser.address).toBe(`/?o=${B}`);
  });

  it("stops writing and listening once cleaned up", () => {
    const { browser, cleanup, store, select } = mount("/");
    store.set({ query: "apt" });

    cleanup();
    vi.advanceTimersByTime(URL_WRITE_DELAY);
    select(A);

    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser.history.pushState).not.toHaveBeenCalled();
    expect(browser.listeners.size).toBe(0);
  });
});
