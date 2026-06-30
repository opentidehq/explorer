import { TYPE_COLORS, type ObjectType } from "@/lib/opentide/types";
import { GRAPH_CANVAS_BG, VOCAB_NODE_COLOR } from "@/lib/graph/render-styles";

export type GraphIconType = ObjectType | "vocab";

/**
 * Lucide-inspired SVG paths (24×24) for composite node images.
 * Keep in sync with TYPE_ICONS in type-icons.ts.
 */
const ICON_GROUPS: Record<GraphIconType, string> = {
  threat: `<circle cx="12" cy="11.9" r="2" fill="ICON"/><path d="M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m8.9 10.1 1.4.8" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m15.1 10.1-1.4.8" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 13.9v1.6" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 5.4c-1-.2-2-.2-3 0" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 16.4c.7-.7 1.2-1.6 1.5-2.5" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 13.9c.3.9.8 1.8 1.5 2.5" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  objective: `<circle cx="12" cy="12" r="10" fill="none" stroke="ICON" stroke-width="2"/><line x1="22" x2="18" y1="12" y2="12" stroke="ICON" stroke-width="2" stroke-linecap="round"/><line x1="6" x2="2" y1="12" y2="12" stroke="ICON" stroke-width="2" stroke-linecap="round"/><line x1="12" x2="12" y1="6" y2="2" stroke="ICON" stroke-width="2" stroke-linecap="round"/><line x1="12" x2="12" y1="22" y2="18" stroke="ICON" stroke-width="2" stroke-linecap="round"/>`,
  signal: `<path d="M2 20h.01" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 20v-4" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 20v-8" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 20V8" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 4v16" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  rule: `<path d="M16 3h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-2" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 21H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  vocab: `<path d="M12 2 3 7v10l9 5 9-5V7Z" fill="none" stroke="ICON" stroke-width="2" stroke-linejoin="round"/><path d="M12 22V12" fill="none" stroke="ICON" stroke-width="2" stroke-linecap="round"/><path d="m3 7 9 5 9-5" fill="none" stroke="ICON" stroke-width="2" stroke-linejoin="round"/>`,
};

type NodeVisualState = "normal" | "dimmed" | "highlighted" | "chain";

function buildNodeSvg(
  type: GraphIconType,
  state: NodeVisualState,
  canvasBg: string,
): string {
  const color = type === "vocab" ? VOCAB_NODE_COLOR : TYPE_COLORS[type];

  let stroke: string;
  let iconColor: string;
  let strokeWidth: number;
  switch (state) {
    case "dimmed":
      stroke = "#3f3f46";
      iconColor = "#6b6b7b";
      strokeWidth = 1.5;
      break;
    case "highlighted":
      stroke = color;
      iconColor = color;
      strokeWidth = 3.5;
      break;
    case "chain":
      stroke = color;
      iconColor = color;
      strokeWidth = 2.5;
      break;
    default:
      stroke = color;
      iconColor = color;
      strokeWidth = 2.25;
  }

  const fill = canvasBg;
  const icon = ICON_GROUPS[type].replaceAll("ICON", iconColor);
  // Scale 24×24 glyph to ~60% of the 52px inner disc (r=26), centered at (32,32).
  const iconTransform = "translate(32,32) scale(1.3) translate(-12,-12)";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
  <circle cx="32" cy="32" r="32" fill="${fill}"/>
  <circle cx="32" cy="32" r="26" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
  <g transform="${iconTransform}">${icon}</g>
</svg>`;
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const CACHE = new Map<string, string>();

export function nodeIconUrl(
  type: GraphIconType,
  options: {
    dimmed?: boolean;
    highlighted?: boolean;
    inChain?: boolean;
    canvasBg?: string;
  } = {},
): string {
  const state: NodeVisualState = options.dimmed
    ? "dimmed"
    : options.highlighted
      ? "highlighted"
      : options.inChain
        ? "chain"
        : "normal";

  const canvasBg = options.canvasBg ?? GRAPH_CANVAS_BG;
  const key = `${type}:${state}:${canvasBg}:v5`;
  let url = CACHE.get(key);
  if (!url) {
    url = svgDataUrl(buildNodeSvg(type, state, canvasBg));
    CACHE.set(key, url);
  }
  return url;
}
