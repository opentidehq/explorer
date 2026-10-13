"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type Sigma from "sigma";
import {
  Check,
  Layers,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Waypoints,
} from "lucide-react";
import {
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { frameNodes } from "@/components/explorer/graph/camera";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Caption } from "@/components/ui/tide";
import { TOPOLOGY_PRESETS } from "@/lib/graph/render-styles";
import { cn } from "@/lib/utils";

function ControlButton({
  label,
  onClick,
  pressed,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          aria-expanded={expanded}
          onClick={onClick}
          className={cn(
            "tide-pill-icon size-8",
            pressed &&
              "bg-accent/12 text-accent hover:bg-accent/15 hover:text-accent",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function Menu({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    // Next tick: the click that opened the menu must not close it.
    const id = window.setTimeout(() =>
      document.addEventListener("pointerdown", onDown),
    );
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      className="tide-fade-slide absolute bottom-0 right-full mr-2 w-64 rounded-2xl border border-line bg-panel p-1.5 shadow-float"
    >
      <Caption className="px-2.5 pt-1.5 pb-1">{title}</Caption>
      {children}
    </div>
  );
}

function MenuItem({
  label,
  description,
  checked,
  disabled,
  onSelect,
  role = "menuitemradio",
}: {
  label: string;
  description: string;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  role?: "menuitemradio" | "menuitemcheckbox" | "menuitem";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
        disabled ? "opacity-45" : "hover:bg-hover",
        checked && "bg-accent/8",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          checked ? "border-accent bg-accent text-accent-fg" : "border-line",
        )}
      >
        {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block text-[11.5px] leading-snug text-subtle">
          {description}
        </span>
      </span>
    </button>
  );
}

/** Zoom, fit, layout and layers: a floating column of pill buttons over the graph. */
export function GraphControls({
  sigma,
  visible,
}: {
  sigma: Sigma;
  visible: Set<string>;
}) {
  const actions = useExplorerActions();
  const topology = useExplorer((s) => s.topology);
  const killchainGrouping = useExplorer((s) => s.killchainGrouping);
  const showVocabNodes = useExplorer((s) => s.showVocabNodes);
  const [menu, setMenu] = useState<"layout" | "layers" | null>(null);
  const camera = sigma.getCamera();

  return (
    <div
      role="toolbar"
      aria-label="Graph controls"
      aria-orientation="vertical"
      className="absolute bottom-3 right-3 z-20 flex flex-col gap-0.5 rounded-2xl border border-line bg-panel/90 p-1 shadow-float backdrop-blur"
    >
      <ControlButton
        label="Zoom in"
        onClick={() => void camera.animatedZoom({ duration: 220 })}
      >
        <Plus className="size-4" aria-hidden />
      </ControlButton>
      <ControlButton
        label="Zoom out"
        onClick={() => void camera.animatedUnzoom({ duration: 220 })}
      >
        <Minus className="size-4" aria-hidden />
      </ControlButton>
      <ControlButton
        label="Fit to view"
        onClick={() => frameNodes(sigma, visible, 450)}
      >
        <Maximize2 className="size-3.5" aria-hidden />
      </ControlButton>
      <span aria-hidden className="mx-auto my-1 h-px w-5 bg-line" />
      <div className="relative">
        <ControlButton
          label="Layout"
          expanded={menu === "layout"}
          pressed={topology !== "force"}
          onClick={() => setMenu((m) => (m === "layout" ? null : "layout"))}
        >
          <Waypoints className="size-4" aria-hidden />
        </ControlButton>
        {menu === "layout" ? (
          <Menu title="layout" onClose={() => setMenu(null)}>
            {killchainGrouping ? (
              <p className="px-2.5 pb-1 text-[11.5px] text-subtle">
                Kill chain grouping places the threats. Turn it off to pick a
                layout.
              </p>
            ) : null}
            {TOPOLOGY_PRESETS.map((preset) => (
              <MenuItem
                key={preset.id}
                label={preset.label}
                description={preset.description}
                checked={topology === preset.id}
                disabled={killchainGrouping}
                onSelect={() => actions.setTopology(preset.id)}
              />
            ))}
            <span aria-hidden className="mx-2 my-1 block h-px bg-line" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                actions.relayout();
                setMenu(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-hover"
            >
              <RotateCcw className="size-3.5 text-subtle" aria-hidden />
              Run the layout again
            </button>
          </Menu>
        ) : null}
      </div>
      <div className="relative">
        <ControlButton
          label="Layers"
          expanded={menu === "layers"}
          pressed={killchainGrouping || showVocabNodes}
          onClick={() => setMenu((m) => (m === "layers" ? null : "layers"))}
        >
          <Layers className="size-4" aria-hidden />
        </ControlButton>
        {menu === "layers" ? (
          <Menu title="layers" onClose={() => setMenu(null)}>
            <MenuItem
              role="menuitemcheckbox"
              label="Kill chain stages"
              description="Group threats into initial foothold, propagation and action."
              checked={killchainGrouping}
              onSelect={() => actions.setKillchainGrouping(!killchainGrouping)}
            />
            <MenuItem
              role="menuitemcheckbox"
              label="Vocabulary values"
              description="Show the taxonomy terms the visible objects use."
              checked={showVocabNodes}
              onSelect={() => actions.setShowVocabNodes(!showVocabNodes)}
            />
          </Menu>
        ) : null}
      </div>
    </div>
  );
}
