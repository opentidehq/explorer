"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  Layers,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useSigma } from "@react-sigma/core";
import { useExplorer } from "@/components/shell/explorer-context";
import {
  DEFAULT_GRAPH_TOPOLOGY,
  TOPOLOGY_PRESETS,
  type GraphLayoutTopology,
} from "@/lib/graph/render-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ZOOM_FACTOR = 1.35;

function ControlButton({
  label,
  onClick,
  pressed,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
            pressed
              ? "border-primary/70 bg-primary/25 text-primary"
              : "border-border/25 bg-card text-muted-foreground hover:border-border/50 hover:bg-muted/40 hover:text-foreground",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="px-2 py-1 text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function TopologyRadioItem({
  label,
  description,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/50",
        checked && !disabled && "bg-primary/10",
      )}
    >
      <Check
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          checked ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[10px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

function TopologyActionItem({
  label,
  description,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/50",
      )}
    >
      <Sparkles
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[10px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

function LayersCheckboxItem({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50",
        checked && "bg-primary/10",
      )}
    >
      <Check
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          checked ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[10px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

export function GraphViewportControls() {
  const sigma = useSigma();
  const {
    graphTopology,
    setGraphTopology,
    requestGraphRelayout,
    killchainGrouping,
    setKillchainGrouping,
    showVocabNodes,
    setShowVocabNodes,
  } = useExplorer();
  const [topologyOpen, setTopologyOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  const zoomIn = () => {
    sigma.getCamera().animatedZoom({ factor: ZOOM_FACTOR, duration: 200 });
  };

  const zoomOut = () => {
    sigma.getCamera().animatedUnzoom({ factor: ZOOM_FACTOR, duration: 200 });
  };

  const resetView = () => {
    sigma.getCamera().animatedReset({ duration: 280 });
  };

  const topologyActive =
    graphTopology.topology !== DEFAULT_GRAPH_TOPOLOGY.topology;
  const layersActive = killchainGrouping || showVocabNodes;

  const selectTopology = (topology: GraphLayoutTopology) => {
    if (killchainGrouping) return;
    setGraphTopology((prev) =>
      prev.topology === topology ? prev : { topology },
    );
  };

  const handleRelayout = () => {
    requestGraphRelayout();
    setTopologyOpen(false);
  };

  const relayoutDescription = killchainGrouping
    ? "Re-apply kill chain stage layout"
    : `Re-apply ${TOPOLOGY_PRESETS.find((preset) => preset.id === graphTopology.topology)?.label ?? "layout"}`;

  return (
    <div
      className="pointer-events-auto absolute bottom-16 right-3 z-50 flex flex-col gap-1 overflow-visible rounded-lg border border-border/30 bg-card p-1 shadow-md"
      role="toolbar"
      aria-label="Graph viewport controls"
    >
      <ControlButton label="Zoom in" onClick={zoomIn}>
        <Plus className="h-4 w-4" aria-hidden />
      </ControlButton>
      <ControlButton label="Zoom out" onClick={zoomOut}>
        <Minus className="h-4 w-4" aria-hidden />
      </ControlButton>
      <ControlButton label="Reset view" onClick={resetView}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      </ControlButton>

      <div className="my-0.5 h-px w-6 self-center bg-border/40" aria-hidden />

      <div className="relative shrink-0">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Graph layers"
              aria-pressed={layersOpen || layersActive}
              aria-expanded={layersOpen}
              aria-haspopup="menu"
              onClick={() => setLayersOpen((open) => !open)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                layersOpen || layersActive
                  ? "border-primary/70 bg-primary/25 text-primary"
                  : "border-border/25 bg-card text-muted-foreground hover:border-border/50 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <Layers className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="px-2 py-1 text-[11px]">
            Graph layers
          </TooltipContent>
        </Tooltip>

        {layersOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close layers menu"
              onClick={() => setLayersOpen(false)}
            />
            <div
              className="absolute bottom-0 right-full z-50 mr-1.5 w-56 overflow-hidden rounded-lg border border-border/30 bg-card py-1 shadow-xl"
              role="menu"
            >
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Layers
              </p>
              <LayersCheckboxItem
                label="Kill chain grouping"
                description="Group threats by kill chain stage"
                checked={killchainGrouping}
                onToggle={() => setKillchainGrouping(!killchainGrouping)}
              />
              <LayersCheckboxItem
                label="Vocabulary nodes"
                description="Show vocab terms linked to visible objects"
                checked={showVocabNodes}
                onToggle={() => setShowVocabNodes(!showVocabNodes)}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="relative shrink-0">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Layout topology"
              aria-pressed={topologyOpen || topologyActive}
              aria-expanded={topologyOpen}
              aria-haspopup="menu"
              onClick={() => setTopologyOpen((open) => !open)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                topologyOpen || topologyActive
                  ? "border-primary/70 bg-primary/25 text-primary"
                  : "border-border/25 bg-card text-muted-foreground hover:border-border/50 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <Network className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="px-2 py-1 text-[11px]">
            Layout topology
          </TooltipContent>
        </Tooltip>

        {topologyOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close topology menu"
              onClick={() => setTopologyOpen(false)}
            />
            <div
              className="absolute bottom-0 right-full z-50 mr-1.5 w-56 overflow-hidden rounded-lg border border-border/30 bg-card py-1 shadow-xl"
              role="menu"
            >
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Layout topology
              </p>
              {killchainGrouping ? (
                <p className="px-2.5 pb-1 text-[10px] leading-snug text-muted-foreground">
                  Kill chain grouping overrides layout. Turn off Layers to pick
                  a topology.
                </p>
              ) : null}
              {TOPOLOGY_PRESETS.map((preset) => (
                <TopologyRadioItem
                  key={preset.id}
                  label={preset.label}
                  description={preset.description}
                  checked={graphTopology.topology === preset.id}
                  disabled={killchainGrouping}
                  onSelect={() => selectTopology(preset.id)}
                />
              ))}
              <div className="my-1 h-px bg-border/30" aria-hidden />
              <TopologyActionItem
                label="Re-run layout"
                description={relayoutDescription}
                onClick={handleRelayout}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
