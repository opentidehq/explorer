"use client";

import { Tag } from "lucide-react";
import {
  TYPE_ICONS,
  TYPE_LABELS,
  TYPE_TEXT_CLASS,
} from "@/lib/graph/type-icons";
import { useExplorer } from "@/components/shell/explorer-context";
import { cn } from "@/lib/utils";

const LEGEND_ITEMS = (["threat", "objective", "signal", "rule"] as const).map(
  (type) => ({
    type,
    label:
      TYPE_LABELS[type].charAt(0) + TYPE_LABELS[type].slice(1).toLowerCase(),
    icon: TYPE_ICONS[type],
    color: TYPE_TEXT_CLASS[type],
  }),
);

export function GraphLegend() {
  const { showVocabNodes, explorerView } = useExplorer();

  if (explorerView !== "graph") return null;

  return (
    <div
      className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-lg border border-border/25 bg-card px-4 py-2 text-[11px] shadow-md"
      aria-label="Graph legend"
    >
      {LEGEND_ITEMS.map(({ type, label, icon: Icon, color }) => (
        <div key={type} className="flex items-center gap-1.5">
          <Icon className={cn("h-3 w-3", color)} aria-hidden />
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
      {showVocabNodes ? (
        <div className="flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-[#a78bfa]" aria-hidden />
          <span className="text-muted-foreground">Vocabulary</span>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="inline-block h-0.5 w-4 bg-[#6366f1]" aria-hidden />
        <span>detection</span>
      </div>
      {showVocabNodes ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className="inline-block h-0.5 w-4 bg-[#a78bfa]/70"
            aria-hidden
          />
          <span>vocab</span>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <svg
          className="h-3 w-4 shrink-0"
          viewBox="0 0 16 3"
          aria-hidden
          fill="none"
        >
          <line
            x1="0"
            y1="1.5"
            x2="16"
            y2="1.5"
            stroke="#e8a838"
            strokeWidth="1.5"
            strokeDasharray="3 2"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
        <span>chain</span>
      </div>
    </div>
  );
}
