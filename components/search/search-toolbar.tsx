"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Biohazard,
  Crosshair,
  Focus,
  Loader2,
  Radio,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useExplorer } from "@/components/shell/explorer-context";
import { parseFilterTokens } from "@/lib/search/filters";
import { collectFilterOptions } from "@/lib/search/orama";
import type { ObjectType } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: ObjectType[] = ["threat", "objective", "signal", "rule"];

export function SearchToolbar() {
  const {
    bundle,
    filters,
    setFilters,
    resetFilters,
    isSearching,
    matchCount,
    visibleIds,
    setSelectedId,
  } = useExplorer();
  const [input, setInput] = useState(filters.query);
  const [showFilters, setShowFilters] = useState(false);
  const [mounted, setMounted] = useState(false);
  const options = useMemo(() => collectFilterOptions(bundle), [bundle]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseFilterTokens(input);
      setFilters({
        query: parsed.query ?? input,
        types: parsed.types ?? filters.types,
        platforms: parsed.platforms ?? filters.platforms,
        statuses: parsed.statuses ?? filters.statuses,
        techniques: parsed.techniques ?? filters.techniques,
        actors: parsed.actors ?? filters.actors,
        uuid: parsed.uuid ?? filters.uuid,
      });
    }, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced merge from input
  }, [input]);

  function toggleType(type: ObjectType) {
    const next = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    setFilters({ types: next });
  }

  function toggleChip(
    key: "platforms" | "statuses" | "techniques" | "actors",
    value: string,
  ) {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ [key]: next });
  }

  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-card/80 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-primary/30">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search name, UUID, technique… type:rule platform:sentinel status:STAGING"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search catalog"
          />
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : mounted ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {matchCount} matches · {visibleIds.size} visible
            </span>
          ) : null}
        </div>

        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="mr-1.5 h-4 w-4" />
          Filters
        </Button>

        <kbd className="hidden rounded border border-border bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground lg:inline">
          ⌘K
        </kbd>

        <ThemeToggle />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {TYPE_OPTIONS.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => toggleType(type)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              filters.types.includes(type)
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/60",
            )}
          >
            <TypeIcon type={type} className="h-3 w-3" />
            {type}
          </button>
        ))}

        <span className="mx-1 hidden h-4 w-px bg-border sm:inline" />

        <select
          value={filters.relationMode}
          onChange={(e) =>
            setFilters({
              relationMode: e.target.value as typeof filters.relationMode,
            })
          }
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
          aria-label="Relation expansion mode"
        >
          <option value="match-only">Matches only</option>
          <option value="include-neighbors">Include neighbors</option>
          <option value="include-chain">Include detection chain</option>
        </select>

        <Button
          variant={filters.stagingOnly ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setFilters({ stagingOnly: !filters.stagingOnly })}
        >
          Staging
        </Button>
        <Button
          variant={filters.productionOnly ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() =>
            setFilters({ productionOnly: !filters.productionOnly })
          }
        >
          Production
        </Button>

        {(filters.types.length > 0 ||
          filters.platforms.length > 0 ||
          filters.statuses.length > 0 ||
          filters.techniques.length > 0 ||
          filters.actors.length > 0 ||
          input) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => {
              resetFilters();
              setInput("");
              setSelectedId(null);
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterGroup
            title="Platform"
            values={options.platforms.slice(0, 12)}
            active={filters.platforms}
            onToggle={(v) => toggleChip("platforms", v)}
          />
          <FilterGroup
            title="Status"
            values={options.statuses}
            active={filters.statuses}
            onToggle={(v) => toggleChip("statuses", v)}
          />
          <FilterGroup
            title="Technique"
            values={options.techniques.slice(0, 16)}
            active={filters.techniques}
            onToggle={(v) => toggleChip("techniques", v)}
          />
          <FilterGroup
            title="Actor"
            values={options.actors.slice(0, 12)}
            active={filters.actors}
            onToggle={(v) => toggleChip("actors", v)}
          />
        </div>
      )}
    </header>
  );
}

function FilterGroup({
  title,
  values,
  active,
  onToggle,
}: {
  title: string;
  values: string[];
  active: string[];
  onToggle: (value: string) => void;
}) {
  if (!values.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-1">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={cn(
              "rounded border px-2 py-0.5 font-mono text-[10px] transition-colors",
              active.includes(value)
                ? "border-primary/40 bg-primary/10"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GraphLegend() {
  const items = [
    {
      type: "threat" as const,
      label: "Threat",
      icon: Biohazard,
      color: "text-threat",
    },
    {
      type: "objective" as const,
      label: "Objective",
      icon: Crosshair,
      color: "text-objective",
    },
    {
      type: "signal" as const,
      label: "Signal",
      icon: Radio,
      color: "text-signal",
    },
    { type: "rule" as const, label: "Rule", icon: Focus, color: "text-rule" },
  ];

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
      aria-label="Graph legend"
    >
      {items.map(({ type, label, icon: Icon, color }) => (
        <div key={type} className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", color)} aria-hidden />
          <span className="text-muted-foreground">{label}</span>
          <Badge variant={type} className="ml-auto scale-90">
            {type}
          </Badge>
        </div>
      ))}
      <div className="mt-1 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
        <span className="text-indigo-400">—</span> detection chain
        <span className="mx-2">·</span>
        <span className="text-objective">—</span> threat chaining
      </div>
    </div>
  );
}

function TypeIcon({
  type,
  className,
}: {
  type: ObjectType;
  className?: string;
}) {
  switch (type) {
    case "threat":
      return <Biohazard className={className} />;
    case "objective":
      return <Crosshair className={className} />;
    case "signal":
      return <Radio className={className} />;
    case "rule":
      return <Focus className={className} />;
  }
}
