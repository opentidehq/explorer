"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { GRAPH_CANVAS_BG } from "@/lib/graph/render-styles";

export type GraphThemeColors = {
  canvasBg: string;
  foreground: string;
  cardBorder: string;
};

const GRAPH_THEME_FALLBACK: GraphThemeColors = {
  canvasBg: GRAPH_CANVAS_BG,
  foreground: "#d4d4dc",
  cardBorder: "#1a1a26",
};

export function readGraphThemeColors(scope?: Element | null): GraphThemeColors {
  if (typeof document === "undefined") return GRAPH_THEME_FALLBACK;

  const el =
    scope ??
    document.querySelector(".explorer-graph-grid-bg .react-sigma") ??
    document.documentElement;
  const styles = getComputedStyle(el);

  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    canvasBg: read("--graph-canvas-bg", GRAPH_CANVAS_BG),
    foreground: read("--graph-foreground", GRAPH_THEME_FALLBACK.foreground),
    cardBorder: read("--graph-card-border", GRAPH_THEME_FALLBACK.cardBorder),
  };
}

/** Reads `--graph-*` tokens from the sigma container after theme changes. */
export function useGraphThemeColors(): GraphThemeColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState(GRAPH_THEME_FALLBACK);

  useEffect(() => {
    const sync = () => setColors(readGraphThemeColors());
    const raf = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(raf);
  }, [resolvedTheme]);

  return colors;
}
