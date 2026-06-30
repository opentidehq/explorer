/** Graph layout topology — how nodes are positioned in space. */
export type GraphLayoutTopology = "force" | "circular" | "type-bands" | "grid";

export type GraphTopologySettings = {
  topology: GraphLayoutTopology;
};

export const DEFAULT_GRAPH_TOPOLOGY: GraphTopologySettings = {
  topology: "force",
};

/** Fixed Sigma label/edge rendering (not exposed in topology menu). */
export const GRAPH_RENDER_DEFAULTS = {
  renderEdgeLabels: false,
  nodeLabelsAlways: false,
  curvedEdges: true,
} as const;

export const VOCAB_NODE_COLOR = "#a78bfa";
export const VOCAB_NODE_SIZE = 6;

/** SSR fallback; client graph code reads `--graph-canvas-bg` at runtime. */
export const GRAPH_CANVAS_BG = "#050508";

/** Inter via next/font `--font-sans` on canvas and SVG overlays. */
export const GRAPH_LABEL_FONT = "Inter, system-ui, sans-serif";

/** Fixed Sigma label/edge rendering settings (not exposed in topology menu). */
export const DEFAULT_GRAPH_RENDER_SETTINGS = {
  renderLabels: true,
  labelDensity: 0.07,
  labelRenderedSizeThreshold: 6,
  hideEdgesOnMove: true,
  hideLabelsOnMove: true,
} as const;

export const TOPOLOGY_PRESETS: {
  id: GraphLayoutTopology;
  label: string;
  description: string;
}[] = [
  {
    id: "force",
    label: "Force-directed",
    description: "Organic clusters via ForceAtlas2",
  },
  {
    id: "circular",
    label: "Circular",
    description: "Nodes arranged on a ring",
  },
  {
    id: "type-bands",
    label: "Type bands",
    description: "Horizontal bands by object type",
  },
  {
    id: "grid",
    label: "Grid",
    description: "Even rows and columns",
  },
];
