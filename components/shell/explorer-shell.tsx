"use client";

import { CatalogView } from "@/components/catalog/catalog-table";
import { CoverageView } from "@/components/coverage/coverage-view";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { useExplorer } from "@/components/shell/explorer-context";

export function ExplorerShell() {
  const { mode } = useExplorer();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {mode === "catalog" && <CatalogView />}
        {mode === "graph" && <GraphCanvas />}
        {mode === "coverage" && <CoverageView />}
      </main>
      <CommandPalette />
    </div>
  );
}
