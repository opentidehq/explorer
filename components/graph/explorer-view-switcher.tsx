"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Columns3, Network, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EXPLORER_VIEW_LABELS,
  EXPLORER_VIEWS,
  type ExplorerView,
} from "@/lib/graph/explorer-view";

const VIEW_ICONS: Record<
  ExplorerView,
  ComponentType<{ className?: string }>
> = {
  graph: Network,
  list: Columns3,
  attack: Shield,
};

type PillMetrics = {
  width: number;
  x: number;
};

export function ExplorerViewSwitcher({
  value,
  onChange,
  className,
}: {
  value: ExplorerView;
  onChange: (view: ExplorerView) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<ExplorerView, HTMLButtonElement>());
  const [pill, setPill] = useState<PillMetrics | null>(null);

  const updatePill = useCallback(() => {
    const container = containerRef.current;
    const tab = tabRefs.current.get(value);
    if (!container || !tab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    setPill({
      width: tabRect.width,
      x: tabRect.left - containerRect.left,
    });
  }, [value]);

  useLayoutEffect(() => {
    updatePill();
  }, [updatePill]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(updatePill);
    observer.observe(container);
    for (const tab of tabRefs.current.values()) {
      observer.observe(tab);
    }

    return () => observer.disconnect();
  }, [updatePill, value]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center rounded-full border border-border bg-card p-0.5",
        className,
      )}
      role="tablist"
      aria-label="Explorer visualization"
    >
      {pill ? (
        <span
          aria-hidden
          className="explorer-view-switcher-pill pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-full bg-primary"
          style={{
            width: pill.width,
            transform: `translateX(${pill.x}px)`,
          }}
        />
      ) : null}
      {EXPLORER_VIEWS.map((view) => {
        const Icon = VIEW_ICONS[view];
        const selected = value === view;
        return (
          <button
            key={view}
            ref={(node) => {
              if (node) tabRefs.current.set(view, node);
              else tabRefs.current.delete(view);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(view)}
            className={cn(
              "explorer-interactive relative z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide",
              selected
                ? "text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {EXPLORER_VIEW_LABELS[view]}
          </button>
        );
      })}
    </div>
  );
}
