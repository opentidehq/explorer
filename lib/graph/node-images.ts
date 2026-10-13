import type { GraphNodeKind } from "@/lib/graph/graph-layout";

/**
 * Graph colours, read from the theme's CSS variables, and the node images drawn from them:
 * the type's icon (as on opentide.org) in a disc tinted with the type's colour.
 */

export interface GraphPalette {
  panel: string;
  ink: string;
  subtle: string;
  accent: string;
  accentFg: string;
  types: Record<GraphNodeKind, string>;
}

export const FALLBACK_PALETTE: GraphPalette = {
  panel: "#ffffff",
  ink: "#0a0a0c",
  subtle: "#52525b",
  accent: "#001489",
  accentFg: "#ffffff",
  types: {
    threat: "#56627d",
    objective: "#2747d6",
    signal: "#0a7ea6",
    rule: "#a26a00",
    vocab: "#7c5cc4",
  },
};

export function readGraphPalette(): GraphPalette {
  if (typeof document === "undefined") return FALLBACK_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const f = FALLBACK_PALETTE;
  return {
    panel: read("--tide-panel", f.panel),
    ink: read("--tide-ink", f.ink),
    subtle: read("--tide-subtle", f.subtle),
    accent: read("--tide-accent", f.accent),
    accentFg: read("--tide-accent-fg", f.accentFg),
    types: {
      threat: read("--type-threat", f.types.threat),
      objective: read("--type-objective", f.types.objective),
      signal: read("--type-signal", f.types.signal),
      rule: read("--type-rule", f.types.rule),
      vocab: read("--type-vocab", f.types.vocab),
    },
  };
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => Number.parseInt(hex[i]! + hex[i]!, 16)) as [
      number,
      number,
      number,
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  return null;
}

/** `a` mixed toward `b` by `t` (0–1), as a hex colour. Falls back to `b` for non-hex input. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const out = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Lucide paths (24×24) for each node kind: Swords, Target, Activity, FileCode2, Tag. */
const ICONS: Record<GraphNodeKind, string> = {
  threat: `<path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 0 1 3 5.172V3h2.172a2 2 0 0 1 1.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0 1 18.828 3H21v2.172a2 2 0 0 1-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>`,
  objective: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
  signal: `<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>`,
  rule: `<path d="M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m5 16-3 3 3 3"/><path d="m9 22 3-3-3-3"/>`,
  vocab: `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>`,
};

/**
 * How a node reads: `normal`; `focus` (hovered or selected: solid); `chain` (on the focus's
 * detection chain or chained to it); `context` (shown beside search matches, not matched);
 * `dimmed` (off the focus).
 */
export type NodeState = "normal" | "focus" | "chain" | "context" | "dimmed";

function nodeSvg(
  kind: GraphNodeKind,
  state: NodeState,
  p: GraphPalette,
): string {
  const color = p.types[kind];
  let fill: string;
  let ring: string;
  let ringWidth: number;
  let icon: string;

  switch (state) {
    case "focus":
      fill = color;
      ring = color;
      ringWidth = 0;
      icon = p.panel;
      break;
    case "chain":
      fill = mix(p.panel, color, 0.22);
      ring = color;
      ringWidth = 4;
      icon = color;
      break;
    case "context":
      fill = p.panel;
      ring = mix(p.panel, color, 0.55);
      ringWidth = 2.5;
      icon = mix(p.panel, color, 0.7);
      break;
    case "dimmed":
      fill = p.panel;
      ring = mix(p.panel, p.ink, 0.14);
      ringWidth = 2;
      icon = mix(p.panel, p.ink, 0.22);
      break;
    default:
      fill = mix(p.panel, color, 0.12);
      ring = color;
      ringWidth = 3;
      icon = color;
  }

  const r = 32 - ringWidth / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128"><circle cx="32" cy="32" r="${r}" fill="${fill}"${ringWidth ? ` stroke="${ring}" stroke-width="${ringWidth}"` : ""}/><g transform="translate(32 32) scale(1.15) translate(-12 -12)" fill="none" stroke="${icon}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</g></svg>`;
}

const cache = new Map<string, string>();

export function nodeImage(
  kind: GraphNodeKind,
  state: NodeState,
  palette: GraphPalette,
): string {
  const key = `${kind}|${state}|${palette.panel}|${palette.ink}|${palette.types[kind]}`;
  let url = cache.get(key);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(nodeSvg(kind, state, palette))}`;
    cache.set(key, url);
  }
  return url;
}

/** The disc colour sigma paints until a node's image has loaded. */
export function nodeBaseColor(
  kind: GraphNodeKind,
  palette: GraphPalette,
): string {
  return mix(palette.panel, palette.types[kind], 0.12);
}
