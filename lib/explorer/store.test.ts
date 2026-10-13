import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "@/lib/explorer/store";

describe("createStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifies only on a change", () => {
    const store = createStore({ n: 0, s: "a" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ n: 0 });
    expect(listener).not.toHaveBeenCalled();
    store.set((state) => ({ n: state.n + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ n: 1, s: "a" });
  });

  it("keeps notifying, and returns to the caller, when a listener throws", () => {
    const queued: Array<() => void> = [];
    vi.stubGlobal("queueMicrotask", (task: () => void) => queued.push(task));
    const store = createStore({ n: 0 });
    const seen: number[] = [];
    store.subscribe(() => {
      throw new Error("history call refused");
    });
    store.subscribe(() => seen.push(store.get().n));

    expect(() => store.set({ n: 1 })).not.toThrow();
    expect(seen).toEqual([1]);
    // The error still surfaces, after the update.
    expect(queued).toHaveLength(1);
    expect(() => queued[0]!()).toThrow("history call refused");
  });
});
