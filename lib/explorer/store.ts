import { useSyncExternalStore } from "react";

/**
 * A minimal external store. Components subscribe to the slice they read, so a hover in the
 * graph re-renders the graph and nothing else — a single React context re-rendered the whole
 * explorer on every pointer move.
 */
export interface Store<S> {
  get: () => S;
  set: (patch: Partial<S> | ((state: S) => Partial<S>)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const key of Object.keys(next) as Array<keyof S>) {
        if (!Object.is(state[key], next[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Read one slice. The selector must return a stored value or a primitive, not a new object. */
export function useStoreSlice<S, T>(
  store: Store<S>,
  selector: (state: S) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
