"use client";

import { ChevronRight, Network, Shield, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExplorer } from "./explorer-context";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { mode, setMode, breadcrumbs, setFocusId } = useExplorer();

  const items = [
    { id: "catalog" as const, label: "Catalog", icon: Table2 },
    { id: "graph" as const, label: "Graph", icon: Network },
    { id: "coverage" as const, label: "Coverage", icon: Shield },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50">
      <div className="border-b border-border p-4">
        <h1 className="text-lg font-semibold tracking-tight">OpenTide</h1>
        <p className="text-xs text-muted-foreground">Explorer</p>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {items.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={mode === id ? "secondary" : "ghost"}
            className={cn("justify-start", mode === id && "bg-muted")}
            onClick={() => setMode(id)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        ))}
      </nav>
      {breadcrumbs.length > 0 && (
        <div className="mt-auto border-t border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Focus trail
          </p>
          <ol className="space-y-1 text-xs">
            {breadcrumbs.map((b, i) => (
              <li key={b.uuid} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
                <button
                  className="truncate text-left hover:text-primary"
                  onClick={() => setFocusId(b.uuid)}
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="p-3 text-[10px] text-muted-foreground">
        ⌘K search · G graph · Esc deselect
      </p>
    </aside>
  );
}
