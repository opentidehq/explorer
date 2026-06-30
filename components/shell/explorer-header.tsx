"use client";

import { Compass } from "lucide-react";
import { ExplorerViewSwitcher } from "@/components/graph/explorer-view-switcher";
import { useExplorer } from "@/components/shell/explorer-context";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function ExplorerHeader() {
  const { explorerView, setExplorerView } = useExplorer();

  return (
    <header className="explorer-header shrink-0 border-b border-border/30 bg-card/80 backdrop-blur-sm">
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 px-5">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <Compass className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <h1 className="font-sans text-xl font-bold tracking-tight text-foreground">
            Explorer
          </h1>
        </div>

        <div className="flex items-center justify-center justify-self-center">
          <ExplorerViewSwitcher
            value={explorerView}
            onChange={setExplorerView}
          />
        </div>

        <div className="flex items-center justify-end gap-2 justify-self-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
