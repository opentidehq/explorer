"use client";

import dynamic from "next/dynamic";
import { useExplorer } from "@/components/shell/explorer-context";
import { cn } from "@/lib/utils";

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

const DetectionListView = dynamic(
  () =>
    import("@/components/graph/detection-list-view").then(
      (m) => m.DetectionListView,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading list…
      </div>
    ),
  },
);

const AttackMatrixView = dynamic(
  () =>
    import("@/components/graph/attack-matrix-view").then(
      (m) => m.AttackMatrixView,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading matrix…
      </div>
    ),
  },
);

export function ExplorerCanvas() {
  const { explorerView } = useExplorer();
  const isGraph = explorerView === "graph";

  return (
    <div
      className={cn(
        "relative h-full w-full",
        isGraph ? "explorer-graph-grid-bg" : "bg-background",
      )}
    >
      <div
        key={explorerView}
        className="explorer-view-panel absolute inset-0 h-full w-full"
      >
        {explorerView === "graph" ? <SigmaGraphCanvas /> : null}
        {explorerView === "list" ? <DetectionListView /> : null}
        {explorerView === "attack" ? <AttackMatrixView /> : null}
      </div>
    </div>
  );
}
