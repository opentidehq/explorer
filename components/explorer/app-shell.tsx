"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  EXPLORER_VIEWS,
  useCatalog,
  useExplorer,
  useExplorerActions,
  useExplorerStore,
} from "@/components/explorer/explorer-state";
import { Header } from "@/components/explorer/header";
import { LibraryOverview } from "@/components/explorer/inspector/library-overview";
import { ObjectInspector } from "@/components/explorer/inspector/object-inspector";
import { Rail } from "@/components/explorer/rail";
import { Stage } from "@/components/explorer/stage";
import { ViewBoundary } from "@/components/explorer/view-boundary";
import { cn } from "@/lib/utils";

const CommandPalette = dynamic(
  () =>
    import("@/components/explorer/command-palette").then(
      (m) => m.CommandPalette,
    ),
  { ssr: false },
);

const DESKTOP = "(min-width: 1024px)";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

const WIDTH_KEY = "opentide.explorer.inspector";
const MIN_WIDTH = 340;
const MAX_WIDTH = 680;

function readWidth(): number {
  try {
    const value = Number.parseInt(
      window.localStorage.getItem(WIDTH_KEY) ?? "",
      10,
    );
    if (Number.isFinite(value))
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
  } catch {
    // Storage unavailable: the default width.
  }
  return 420;
}

/** Drag the inspector's left edge to resize it; the width is remembered. */
function ResizeEdge({ onResize }: { onResize: (delta: number) => void }) {
  const last = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the inspector"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(24);
        if (event.key === "ArrowRight") onResize(-24);
      }}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        last.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(event) => {
        if (last.current == null) return;
        onResize(last.current - event.clientX);
        last.current = event.clientX;
      }}
      onPointerUp={() => {
        last.current = null;
        document.body.style.userSelect = "";
      }}
      onPointerCancel={() => {
        last.current = null;
        document.body.style.userSelect = "";
      }}
      className="group absolute inset-y-4 -left-2 z-10 flex w-3 cursor-col-resize justify-center outline-none"
    >
      <span className="h-full w-px rounded-full bg-transparent transition-colors group-hover:bg-accent/50 group-focus-visible:bg-accent" />
    </div>
  );
}

/**
 * Radix gives focus back to a `Dialog.Trigger`; the drawer and the sheet open from anywhere
 * (a row, a graph node, a key), so give it back to whatever held it.
 */
function useReturnFocus() {
  const holder = useRef<HTMLElement | null>(null);
  return useMemo(
    () => ({
      onOpenAutoFocus: () => {
        const active = document.activeElement;
        holder.current = active instanceof HTMLElement ? active : null;
      },
      onCloseAutoFocus: (event: Event) => {
        event.preventDefault();
        const target = holder.current;
        holder.current = null;
        if (target?.isConnected) target.focus({ preventScroll: true });
      },
    }),
    [],
  );
}

function InspectorBody({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const selectedId = useExplorer((s) => s.selectedId);
  const summary = selectedId ? catalog.summaries.get(selectedId) : undefined;
  return (
    <ViewBoundary
      what={summary ? "this object" : "the overview"}
      resetKey={selectedId}
    >
      {summary ? (
        <div key={summary.uuid} className="tide-slide-in h-full">
          <ObjectInspector summary={summary} onClose={onClose} />
        </div>
      ) : (
        <LibraryOverview />
      )}
    </ViewBoundary>
  );
}

/**
 * The explorer, laid out like an app built from opentide.org's parts: the header pill, the
 * corpus rail, the stage, and the inspector, all panels on the band. Below the desktop
 * breakpoint the rail becomes a drawer and the inspector a sheet.
 */
export function AppShell() {
  const actions = useExplorerActions();
  const store = useExplorerStore();
  const desktop = useMediaQuery(DESKTOP);
  const selectedId = useExplorer((s) => s.selectedId);
  const railOpen = useExplorer((s) => s.railOpen);
  const paletteOpen = useExplorer((s) => s.paletteOpen);
  const [overviewSheet, setOverviewSheet] = useState(false);
  const [width, setWidth] = useState(readWidth);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerFocus = useReturnFocus();
  const sheetFocus = useReturnFocus();

  // Keep the palette mounted once it has opened: latch during render, not in an effect.
  if (paletteOpen && !paletteUsed) setPaletteUsed(true);

  // Once the first view is up, fetch the other views and the markdown renderer while the
  // browser is idle, so switching and opening objects never waits on the network.
  useEffect(() => {
    const warm = () => {
      void import("@/components/explorer/graph/graph-view");
      void import("@/components/explorer/catalogue/catalogue-view");
      void import("@/components/explorer/attack/attack-view");
      void import("react-markdown");
    };
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(warm, 1500);
    return () => globalThis.clearTimeout(id);
  }, []);

  const resize = useCallback((delta: number) => {
    setWidth((current) =>
      Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current + delta)),
    );
  }, []);

  // Remember the width once a drag settles.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
      } catch {
        // Not remembered.
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [width]);

  const closeInspector = useCallback(() => {
    actions.select(null);
    setOverviewSheet(false);
  }, [actions]);

  // Keys: ⌘K jumps, / searches, 1–3 switch views, Esc steps back.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        actions.setPaletteOpen(!store.get().paletteOpen);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        if (!window.matchMedia(DESKTOP).matches) actions.setRailOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      const view = EXPLORER_VIEWS[Number(event.key) - 1];
      if (view) {
        actions.setView(view);
        return;
      }
      // A dialog that closed on this Escape has handled it.
      if (event.key === "Escape" && !event.defaultPrevented) {
        const state = store.get();
        if (state.paletteOpen) return;
        if (state.railOpen) actions.setRailOpen(false);
        else if (state.selectedId) actions.select(null);
        else setOverviewSheet(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, store]);

  const sheetOpen = !desktop && (Boolean(selectedId) || overviewSheet);

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#stage"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to the explorer
      </a>
      <Header onOpenOverview={() => setOverviewSheet(true)} />

      <div className="relative flex min-h-0 flex-1 gap-3 px-3 pb-3">
        {desktop ? (
          <aside
            aria-label="Library filters"
            className="flex w-[288px] shrink-0"
          >
            <Rail searchRef={searchRef} />
          </aside>
        ) : null}

        <main
          id="stage"
          className="tide-panel relative min-w-0 flex-1 overflow-hidden"
        >
          <Stage />
        </main>

        {desktop ? (
          <aside
            aria-label="Inspector"
            className="relative flex shrink-0"
            style={{ width }}
          >
            <ResizeEdge onResize={resize} />
            <div className="tide-panel h-full w-full overflow-hidden">
              <InspectorBody onClose={closeInspector} />
            </div>
          </aside>
        ) : null}
      </div>

      {/* Below the desktop breakpoint the rail and the inspector cover the stage: modal
          dialogs that take focus, keep it, and give it back on close. */}
      <DialogPrimitive.Root
        open={!desktop && railOpen}
        onOpenChange={actions.setRailOpen}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-band/60 backdrop-blur-sm" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            {...drawerFocus}
            // Escape in the search box closes its suggestions, then clears it, before it
            // closes the drawer.
            onEscapeKeyDown={(event) => {
              const field = event.target;
              if (
                field instanceof HTMLInputElement &&
                (field.getAttribute("aria-expanded") === "true" || field.value)
              ) {
                event.preventDefault();
              }
            }}
            className="tide-slide-in fixed inset-y-3 left-3 z-40 flex w-[min(320px,calc(100vw-1.5rem))] flex-col outline-none"
          >
            <DialogPrimitive.Title className="sr-only">
              Library filters
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close filters"
              className="tide-pill-icon absolute right-2 top-2 z-10 size-8"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
            <Rail searchRef={searchRef} className="shadow-float" />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeInspector();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-band/60 backdrop-blur-sm" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            {...sheetFocus}
            className={cn(
              "tide-sheet-in fixed inset-x-2 bottom-2 top-16 z-40 overflow-hidden outline-none",
              "tide-panel shadow-float sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[min(440px,calc(100vw-1.5rem))]",
            )}
          >
            <DialogPrimitive.Title className="sr-only">
              {selectedId ? "Inspector" : "Library overview"}
            </DialogPrimitive.Title>
            {!selectedId ? (
              <DialogPrimitive.Close
                aria-label="Close the overview"
                className="tide-pill-icon absolute right-2 top-2 z-10 size-8"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            ) : null}
            <InspectorBody onClose={closeInspector} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {paletteUsed || paletteOpen ? <CommandPalette /> : null}
    </div>
  );
}
