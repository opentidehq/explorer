"use client";

import dynamic from "next/dynamic";
import { ObjectDetailPanel } from "@/components/objects/object-detail-panel";
import { GraphLegend, SearchToolbar } from "@/components/search/search-toolbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { useExplorer } from "@/components/shell/explorer-context";

const SigmaGraphCanvas = dynamic(
  () =>
    import("@/components/graph/sigma-graph-canvas").then(
      (m) => m.SigmaGraphCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph…
      </div>
    ),
  },
);

export function ExplorerShell() {
  const { selectedId, setSelectedId, bundle, getSummary } = useExplorer();
  const summary = selectedId ? getSummary(selectedId) : null;
  const body = selectedId ? bundle.flatIndex[selectedId] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <SearchToolbar />
      <div className="relative min-h-0 flex-1">
        <SigmaGraphCanvas />
        <GraphLegend />
        {summary && body && (
          <ObjectDetailPanel
            summary={summary}
            body={body}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      <CommandPalette />
    </div>
  );
}
