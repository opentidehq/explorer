"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { SearchX } from "lucide-react";
import {
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { ViewBoundary } from "@/components/explorer/view-boundary";

function ViewLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="flex items-center gap-2 font-mono text-[11px] text-subtle">
        <span aria-hidden className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="tide-wave size-1 rounded-full bg-accent"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
        {label}
      </p>
    </div>
  );
}

const GraphView = dynamic(
  () =>
    import("@/components/explorer/graph/graph-view").then((m) => m.GraphView),
  { ssr: false, loading: () => <ViewLoading label="drawing the graph" /> },
);

const CatalogueView = dynamic(
  () =>
    import("@/components/explorer/catalogue/catalogue-view").then(
      (m) => m.CatalogueView,
    ),
  {
    ssr: false,
    loading: () => <ViewLoading label="laying out the catalogue" />,
  },
);

const AttackView = dynamic(
  () =>
    import("@/components/explorer/attack/attack-view").then(
      (m) => m.AttackView,
    ),
  { ssr: false, loading: () => <ViewLoading label="building the matrix" /> },
);

/** Shown by every view when the search leaves nothing. */
export function NoMatches({ children }: { children?: ReactNode }) {
  const actions = useExplorerActions();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent">
        <SearchX className="size-5" aria-hidden />
      </span>
      <p className="text-base font-semibold tracking-[-0.01em]">
        Nothing matches this search
      </p>
      <p className="max-w-sm text-sm text-muted">
        {children ??
          "Loosen a filter or widen the reach to bring linked objects back."}
      </p>
      <button
        type="button"
        className="tide-btn-secondary mt-1"
        onClick={actions.resetFilters}
      >
        Clear the search
      </button>
    </div>
  );
}

/** The centre panel: whichever view is chosen, each loaded on first use. */
export function Stage() {
  const view = useExplorer((s) => s.view);
  return (
    <div key={view} className="tide-fade-slide absolute inset-0">
      <ViewBoundary what="this view" resetKey={view}>
        {view === "graph" ? <GraphView /> : null}
        {view === "catalogue" ? <CatalogueView /> : null}
        {view === "attack" ? <AttackView /> : null}
      </ViewBoundary>
    </div>
  );
}
