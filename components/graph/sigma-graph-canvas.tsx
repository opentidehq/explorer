"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import {
  EdgeCurvedArrowProgram,
  indexParallelEdgesIndex,
} from "@sigma/edge-curve";
import { EdgeArrowProgram } from "sigma/rendering";
import type {
  NodeHoverDrawingFunction,
  NodeLabelDrawingFunction,
} from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { NodeImageProgram } from "@sigma/node-image";
import type Graph from "graphology";
import { Network } from "lucide-react";
import { useExplorer } from "@/components/shell/explorer-context";
import {
  getCausalChain,
  applyForceAtlasLayout,
  applyGraphTopology,
} from "@/lib/graph/corpus-graph";
import {
  buildDisplayGraph,
  buildVocabGraphLayer,
  expandVisibleIdsWithVocab,
  isVocabNodeId,
} from "@/lib/graph/vocab-nodes";
import {
  applyKillchainLayout,
  computeKillchainLayout,
  computeKillchainViewBBox,
  positionKillchainSatellites,
  restoreBasePositions,
  snapshotBasePositions,
  type KillchainGroupLayout,
} from "@/lib/graph/killchain-grouping";
import { nodeIconUrl } from "@/lib/graph/node-icons";
import {
  DEFAULT_GRAPH_RENDER_SETTINGS,
  GRAPH_LABEL_FONT,
  GRAPH_RENDER_DEFAULTS,
} from "@/lib/graph/render-styles";
import {
  type GraphThemeColors,
  useGraphThemeColors,
} from "@/lib/graph/graph-theme";
import type { GraphTopologySettings } from "@/lib/graph/render-styles";
import type { VocabTerm } from "@/lib/opentide/vocab";
import { TYPE_COLORS } from "@/lib/opentide/types";
import type { GraphIconType } from "@/lib/graph/node-icons";
import { GraphViewportControls } from "@/components/graph/graph-viewport-controls";

const CHAINING_EDGE_COLOR = "#e8a838";
const DETECTION_EDGE_COLOR = "#6366f1";

const STAGE_BOX_COLORS: Record<string, { fill: string; stroke: string }> = {
  "Initial Foothold": {
    fill: "rgba(245, 158, 11, 0.08)",
    stroke: "rgba(245, 158, 11, 0.45)",
  },
  "Network Propagation": {
    fill: "rgba(59, 130, 246, 0.08)",
    stroke: "rgba(59, 130, 246, 0.45)",
  },
  "Action on Objectives": {
    fill: "rgba(239, 68, 68, 0.08)",
    stroke: "rgba(239, 68, 68, 0.45)",
  },
  Unassigned: {
    fill: "rgba(107, 107, 123, 0.08)",
    stroke: "rgba(107, 107, 123, 0.4)",
  },
};

const SVG_NS = "http://www.w3.org/2000/svg";

const CHAINING_LABEL_FONT_SIZE = 11;
const CHAINING_LABEL_PAD_X = 7;
const CHAINING_LABEL_PAD_Y = 4;

function scheduleCameraRaf(rafRef: { current: number }, fn: () => void) {
  cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(fn);
}

const SIGMA_SETTINGS = {
  renderLabels: true,
  renderEdgeLabels: false,
  edgeLabelSize: 11,
  edgeLabelColor: { color: "#6b6b7b" },
  edgeLabelFont: GRAPH_LABEL_FONT,
  edgeLabelWeight: "600",
  labelFont: GRAPH_LABEL_FONT,
  labelSize: 11,
  labelWeight: "500",
  labelColor: { color: "#6b6b7b" },
  defaultNodeType: "image",
  defaultEdgeType: "curvedArrow",
  nodeProgramClasses: {
    image: NodeImageProgram,
  },
  edgeProgramClasses: {
    curvedArrow: EdgeCurvedArrowProgram,
    arrow: EdgeArrowProgram,
  },
  allowInvalidContainer: true,
  labelDensity: 0.07,
  labelGridCellSize: 90,
  zIndex: true,
  hideEdgesOnMove: true,
  hideLabelsOnMove: true,
} as const;

/** Max zoom-out relative to the fitted reset view (ratio 1). */
const MAX_ZOOM_OUT_FACTOR = 1.45;
const MIN_ZOOM_IN_RATIO = 0.1;

function resetSigmaCamera(
  sigma: ReturnType<typeof useSigma>,
  duration = 280,
): void {
  try {
    sigma.refresh();
    sigma.getCamera().animatedReset({ duration });
  } catch {
    // Camera may not be ready on first paint.
  }
}

function safeRefresh(sigma: ReturnType<typeof useSigma>) {
  try {
    if (sigma.getGraph().order === 0) return;
    sigma.refresh();
  } catch {
    // Sigma may not be ready during mount or container resize.
  }
}

function safeResize(sigma: ReturnType<typeof useSigma>, force = true) {
  try {
    sigma.resize(force);
    safeRefresh(sigma);
  } catch {
    // Container may not have dimensions yet.
  }
}

function resolveNodeLabelColor(
  data: Record<string, unknown>,
  settings: Settings,
  fallbackForeground: string,
): string {
  if (typeof data.labelColor === "string") return data.labelColor;
  if (settings.labelColor.attribute) {
    const attr = data[settings.labelColor.attribute];
    if (typeof attr === "string") return attr;
  }
  return settings.labelColor.color ?? fallbackForeground;
}

function drawGraphNodeLabel(
  context: CanvasRenderingContext2D,
  data: Record<string, unknown>,
  settings: Settings,
  theme: GraphThemeColors,
) {
  const label = data.label;
  if (!label || typeof label !== "string") return;

  const highlighted = Boolean(data.highlighted);
  const size = (data.labelSize as number) ?? settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
  const defaultColor = resolveNodeLabelColor(data, settings, theme.foreground);
  const x = (data.x as number) + (data.size as number) + 3;
  const y = (data.y as number) + (data.size as number) / 3;

  context.font = `${weight} ${size}px ${font}`;
  const textWidth = context.measureText(label).width;

  if (highlighted) {
    const objectType = data.objectType as GraphIconType | undefined;
    const accent =
      objectType && objectType !== "vocab"
        ? TYPE_COLORS[objectType]
        : objectType === "vocab"
          ? "#a78bfa"
          : "#6366f1";
    const padX = 6;
    const padY = 3;
    const boxW = textWidth + padX * 2;
    const boxH = size + padY * 2;
    const bx = x - padX;
    const by = y - size;

    context.fillStyle = theme.canvasBg;
    context.strokeStyle = accent;
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(bx, by, boxW, boxH, 4);
    context.fill();
    context.stroke();
    context.fillStyle = theme.foreground;
  } else {
    context.fillStyle = defaultColor;
  }

  context.fillText(label, x, y);
}

function SigmaAutoResize() {
  const sigma = useSigma();

  useEffect(() => {
    const container = sigma.getContainer();
    const resize = () => safeResize(sigma, true);

    resize();
    const raf = requestAnimationFrame(resize);

    const observer = new ResizeObserver(() => resize());
    observer.observe(container);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [sigma]);

  return null;
}

function SigmaCameraLimits() {
  const sigma = useSigma();

  const applyLimits = useCallback(() => {
    try {
      sigma.setSettings({
        maxCameraRatio: MAX_ZOOM_OUT_FACTOR,
        minCameraRatio: MIN_ZOOM_IN_RATIO,
      });
    } catch {
      // Sigma may not be ready during mount.
    }
  }, [sigma]);

  useEffect(() => {
    applyLimits();
    const raf = requestAnimationFrame(applyLimits);
    return () => cancelAnimationFrame(raf);
  }, [applyLimits]);

  return null;
}

function GraphLoader({
  graph,
  onGraphLoaded,
}: {
  graph: Graph;
  onGraphLoaded?: () => void;
}) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  const loadedRef = useRef<Graph | null>(null);

  useEffect(() => {
    if (loadedRef.current === graph) return;
    indexParallelEdgesIndex(graph);
    loadGraph(graph);
    loadedRef.current = graph;
    snapshotBasePositions(sigma.getGraph());
    onGraphLoaded?.();
    safeResize(sigma, true);
  }, [graph, loadGraph, onGraphLoaded, sigma]);

  return null;
}

function GraphLayoutApplier({
  topology,
  layoutNonce,
  killchainGrouping,
  graphLoadedNonce,
  visibleIds,
  killchainVocab,
  onGroupsChange,
}: {
  topology: GraphTopologySettings["topology"];
  layoutNonce: number;
  killchainGrouping: boolean;
  graphLoadedNonce: number;
  visibleIds: Set<string>;
  killchainVocab: Record<string, VocabTerm>;
  onGroupsChange: (groups: KillchainGroupLayout[]) => void;
}) {
  const sigma = useSigma();
  const { bundle } = useExplorer();
  const prevTopologyRef = useRef(topology);
  const prevKillchainRef = useRef(killchainGrouping);
  const visibleIdsRef = useRef(visibleIds);
  visibleIdsRef.current = visibleIds;

  useEffect(() => {
    const graph = sigma.getGraph();
    if (graph.order === 0) return;

    const topologyChanged = prevTopologyRef.current !== topology;
    const killchainTurnedOff = prevKillchainRef.current && !killchainGrouping;
    prevTopologyRef.current = topology;
    prevKillchainRef.current = killchainGrouping;

    if (killchainGrouping) {
      applyForceAtlasLayout(graph);
      snapshotBasePositions(graph, { force: true });
      const { positions, groups } = computeKillchainLayout(
        bundle,
        visibleIdsRef.current,
        killchainVocab,
      );
      applyKillchainLayout(graph, positions);
      positionKillchainSatellites(graph, visibleIdsRef.current, positions);
      onGroupsChange(groups);

      const viewBBox = computeKillchainViewBBox(
        groups,
        graph,
        visibleIdsRef.current,
      );
      if (viewBBox) {
        sigma.setCustomBBox(viewBBox);
      } else {
        sigma.setCustomBBox(null);
      }
    } else {
      sigma.setCustomBBox(null);
      if (killchainTurnedOff) {
        restoreBasePositions(graph);
      } else if (topologyChanged || layoutNonce > 0) {
        applyGraphTopology(graph, topology);
        snapshotBasePositions(graph, { force: true });
      } else if (graphLoadedNonce > 0) {
        snapshotBasePositions(graph);
      }
      onGroupsChange([]);
    }

    safeRefresh(sigma);
    resetSigmaCamera(sigma);
  }, [
    topology,
    layoutNonce,
    killchainGrouping,
    graphLoadedNonce,
    killchainVocab,
    sigma,
    bundle,
    onGroupsChange,
  ]);

  useEffect(() => {
    if (!killchainGrouping) return;

    const graph = sigma.getGraph();
    if (graph.order === 0) return;

    const { positions, groups } = computeKillchainLayout(
      bundle,
      visibleIds,
      killchainVocab,
    );
    applyKillchainLayout(graph, positions);
    positionKillchainSatellites(graph, visibleIds, positions);
    onGroupsChange(groups);

    const viewBBox = computeKillchainViewBBox(groups, graph, visibleIds);
    if (viewBBox) {
      sigma.setCustomBBox(viewBBox);
    } else {
      sigma.setCustomBBox(null);
    }

    safeRefresh(sigma);
  }, [
    visibleIds,
    killchainGrouping,
    killchainVocab,
    sigma,
    bundle,
    onGroupsChange,
  ]);

  return null;
}

function KillchainGroupsOverlay({
  groups,
}: {
  groups: KillchainGroupLayout[];
}) {
  const sigma = useSigma();
  const svgRef = useRef<SVGSVGElement>(null);
  const groupsRef = useRef(groups);
  const nodeRefs = useRef<
    Map<
      string,
      {
        g: SVGGElement;
        rect: SVGRectElement;
        label: SVGTextElement;
        count: SVGTextElement;
        nodeCount: number;
      }
    >
  >(new Map());
  const rafRef = useRef(0);

  const syncStructure = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const currentGroups = groupsRef.current;
    const nodes = nodeRefs.current;
    const nextIds = new Set<string>(currentGroups.map((group) => group.stage));

    for (const [id, entry] of nodes) {
      if (!nextIds.has(id)) {
        entry.g.remove();
        nodes.delete(id);
      }
    }

    for (const group of currentGroups) {
      const colors =
        STAGE_BOX_COLORS[group.stage] ?? STAGE_BOX_COLORS.Unassigned!;
      let entry = nodes.get(group.stage);

      if (!entry) {
        const g = document.createElementNS(SVG_NS, "g");
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("rx", "14");
        rect.setAttribute("stroke-width", "1.5");
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("font-size", "11");
        label.setAttribute("font-weight", "600");
        label.setAttribute("font-family", GRAPH_LABEL_FONT);
        label.setAttribute("class", "select-none");
        const count = document.createElementNS(SVG_NS, "text");
        count.setAttribute("font-size", "10");
        count.setAttribute("font-family", GRAPH_LABEL_FONT);
        count.setAttribute("text-anchor", "end");
        count.setAttribute("opacity", "0.85");
        count.setAttribute("class", "select-none");
        g.appendChild(rect);
        g.appendChild(label);
        g.appendChild(count);
        svg.appendChild(g);
        entry = { g, rect, label, count, nodeCount: -1 };
        nodes.set(group.stage, entry);
      }

      entry.rect.setAttribute("fill", colors.fill);
      entry.rect.setAttribute("stroke", colors.stroke);
      entry.label.setAttribute("fill", colors.stroke);
      entry.count.setAttribute("fill", colors.stroke);
      entry.label.textContent = group.label;
      if (entry.nodeCount !== group.nodeIds.length) {
        entry.count.textContent = String(group.nodeIds.length);
        entry.nodeCount = group.nodeIds.length;
      }
    }
  }, []);

  const updatePositions = useCallback(() => {
    for (const group of groupsRef.current) {
      const entry = nodeRefs.current.get(group.stage);
      if (!entry) continue;

      const tl = sigma.graphToViewport({
        x: group.minX,
        y: group.maxY,
      });
      const br = sigma.graphToViewport({
        x: group.maxX,
        y: group.minY,
      });
      const width = br.x - tl.x;
      const height = br.y - tl.y;
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 8 ||
        height < 8
      ) {
        entry.g.style.display = "none";
        continue;
      }

      entry.g.style.display = "";
      entry.rect.setAttribute("x", String(tl.x));
      entry.rect.setAttribute("y", String(tl.y));
      entry.rect.setAttribute("width", String(width));
      entry.rect.setAttribute("height", String(height));
      entry.label.setAttribute("x", String(tl.x + 12));
      entry.label.setAttribute("y", String(tl.y + 18));
      entry.count.setAttribute("x", String(tl.x + width - 12));
      entry.count.setAttribute("y", String(tl.y + 18));
    }
  }, [sigma]);

  useEffect(() => {
    groupsRef.current = groups;
    if (!groups.length) {
      svgRef.current?.replaceChildren();
      nodeRefs.current.clear();
      return;
    }
    syncStructure();
    updatePositions();
  }, [groups, syncStructure, updatePositions]);

  useEffect(() => {
    if (!groups.length) return;

    const onCameraUpdate = () => {
      scheduleCameraRaf(rafRef, updatePositions);
    };

    const camera = sigma.getCamera();
    camera.on("updated", onCameraUpdate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      camera.off("updated", onCameraUpdate);
    };
  }, [sigma, groups.length, updatePositions]);

  if (!groups.length) return null;

  return (
    <svg
      ref={svgRef}
      className="graph-canvas-underlay pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

function GraphEvents({
  onHoverEdge,
}: {
  onHoverEdge: (edge: string | null) => void;
}) {
  const { setSelectedId, setHoveredId } = useExplorer();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        if (isVocabNodeId(node)) return;
        setSelectedId(node);
      },
      clickStage: () => setSelectedId(null),
      enterNode: ({ node }) => setHoveredId(node),
      leaveNode: () => setHoveredId(null),
      enterEdge: ({ edge }) => onHoverEdge(edge),
      leaveEdge: () => onHoverEdge(null),
    });
  }, [registerEvents, setSelectedId, setHoveredId, onHoverEdge]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedId]);

  return null;
}

function GraphRefresh({
  visibleIds,
  hoveredId,
  selectedId,
  highlightNodes,
  highlightEdges,
}: {
  visibleIds: Set<string>;
  hoveredId: string | null;
  selectedId: string | null;
  highlightNodes: Set<string>;
  highlightEdges: Set<string>;
}) {
  const sigma = useSigma();
  const frameRef = useRef(0);
  const visibleRef = useRef(visibleIds);
  visibleRef.current = visibleIds;

  useEffect(() => {
    const graph = sigma.getGraph();
    if (graph.order === 0) return;

    const focusId = hoveredId ?? selectedId;
    const hasFocus = Boolean(focusId);

    graph.forEachNode((node, attrs) => {
      const baseSize = (attrs.baseSize as number) ?? (attrs.size as number);
      if (!attrs.baseSize) {
        graph.setNodeAttribute(node, "baseSize", baseSize);
      }

      const visible = visibleRef.current.has(node);
      const inChain = !hasFocus || highlightNodes.has(node);
      const isFocus = node === focusId;

      graph.setNodeAttribute(node, "hidden", !visible);
      graph.setNodeAttribute(node, "dimmed", visible && hasFocus && !inChain);
      graph.setNodeAttribute(node, "highlighted", isFocus);
      graph.setNodeAttribute(node, "inChain", inChain);
      graph.setNodeAttribute(
        node,
        "size",
        isFocus
          ? baseSize * 1.4
          : inChain && hasFocus
            ? baseSize * 1.08
            : baseSize,
      );
    });

    graph.forEachEdge((edge, attrs) => {
      const source = graph.source(edge);
      const target = graph.target(edge);
      const visible =
        visibleRef.current.has(source) && visibleRef.current.has(target);
      const inChain = !hasFocus || highlightEdges.has(edge);
      graph.setEdgeAttribute(edge, "hidden", !visible);
      graph.setEdgeAttribute(edge, "dimmed", visible && hasFocus && !inChain);
      graph.setEdgeAttribute(edge, "inChain", visible && hasFocus && inChain);
      if (!attrs.baseSize) {
        graph.setEdgeAttribute(edge, "baseSize", attrs.size as number);
      }
    });

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => safeRefresh(sigma));
  }, [
    sigma,
    visibleIds,
    hoveredId,
    selectedId,
    highlightNodes,
    highlightEdges,
  ]);

  return null;
}

interface EdgeSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  label: string;
  opacity: number;
  strokeWidth: number;
  animate: boolean;
}

function toViewportPoint(
  sigma: ReturnType<typeof useSigma>,
  point: { x: number; y: number },
) {
  return sigma.framedGraphToViewport(point);
}

/** Node display radius in viewport pixels (for trimming edges at disc boundary). */
function nodeViewportRadius(
  sigma: ReturnType<typeof useSigma>,
  display: { x: number; y: number; size: number },
): number {
  const center = sigma.graphToViewport({ x: display.x, y: display.y });
  const rim = sigma.graphToViewport({
    x: display.x + display.size,
    y: display.y,
  });
  return Math.hypot(rim.x - center.x, rim.y - center.y);
}

function trimSegmentToNodeDiscs(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sourceRadius: number,
  targetRadius: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= sourceRadius + targetRadius + 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * sourceRadius,
    y1: y1 + uy * sourceRadius,
    x2: x2 - ux * targetRadius,
    y2: y2 - uy * targetRadius,
  };
}

function ChainingEdgesOverlay({
  focusId,
  highlightEdges,
  hoveredEdge,
  theme,
}: {
  focusId: string | null;
  highlightEdges: Set<string>;
  hoveredEdge: string | null;
  theme: GraphThemeColors;
}) {
  const sigma = useSigma();
  const svgRef = useRef<SVGSVGElement>(null);
  const focusIdRef = useRef(focusId);
  const highlightEdgesRef = useRef(highlightEdges);
  const hoveredEdgeRef = useRef(hoveredEdge);
  const edgeRefs = useRef<
    Map<
      string,
      {
        g: SVGGElement;
        line: SVGLineElement;
        labelBg: SVGRectElement | null;
        label: SVGTextElement | null;
        labelText: string;
      }
    >
  >(new Map());
  const rafRef = useRef(0);

  focusIdRef.current = focusId;
  highlightEdgesRef.current = highlightEdges;
  hoveredEdgeRef.current = hoveredEdge;

  const computeSegment = useCallback(
    (
      edge: string,
      attrs: Record<string, unknown>,
      graph: Graph,
    ): EdgeSegment | null => {
      if (attrs.kind !== "chaining") return null;
      if (attrs.hidden) return null;

      const source = graph.source(edge);
      const target = graph.target(edge);
      const s = sigma.getNodeDisplayData(source);
      const t = sigma.getNodeDisplayData(target);
      if (!s || !t || s.hidden || t.hidden) return null;
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) return null;

      const sVp = toViewportPoint(sigma, s);
      const tVp = toViewportPoint(sigma, t);
      if (
        !Number.isFinite(sVp.x) ||
        !Number.isFinite(sVp.y) ||
        !Number.isFinite(tVp.x) ||
        !Number.isFinite(tVp.y)
      ) {
        return null;
      }

      const trimmed = trimSegmentToNodeDiscs(
        sVp.x,
        sVp.y,
        tVp.x,
        tVp.y,
        nodeViewportRadius(sigma, s),
        nodeViewportRadius(sigma, t),
      );
      if (!trimmed) return null;

      const hasFocus = Boolean(focusIdRef.current);
      const dimmed = Boolean(attrs.dimmed);
      const inChain =
        !hasFocus ||
        highlightEdgesRef.current.has(edge) ||
        edge === hoveredEdgeRef.current;
      const isHovered = edge === hoveredEdgeRef.current;

      let opacity = 0.72;
      if (dimmed) opacity = 0.12;
      else if (isHovered) opacity = 1;
      else if (inChain && hasFocus) opacity = 0.92;

      return {
        id: edge,
        x1: trimmed.x1,
        y1: trimmed.y1,
        x2: trimmed.x2,
        y2: trimmed.y2,
        mx: (trimmed.x1 + trimmed.x2) / 2,
        my: (trimmed.y1 + trimmed.y2) / 2,
        label: String(attrs.label ?? ""),
        opacity,
        strokeWidth: isHovered ? 3 : inChain && hasFocus ? 2.75 : 2.25,
        animate: false,
      };
    },
    [sigma],
  );

  const applySegment = useCallback(
    (entry: EdgeSegment) => {
      const nodes = edgeRefs.current;
      let el = nodes.get(entry.id);

      if (!el) {
        const g = document.createElementNS(SVG_NS, "g");
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("stroke", CHAINING_EDGE_COLOR);
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("stroke-dasharray", "7 5");
        g.appendChild(line);
        svgRef.current?.appendChild(g);
        el = { g, line, labelBg: null, label: null, labelText: "" };
        nodes.set(entry.id, el);
      }

      el.line.setAttribute("x1", String(entry.x1));
      el.line.setAttribute("y1", String(entry.y1));
      el.line.setAttribute("x2", String(entry.x2));
      el.line.setAttribute("y2", String(entry.y2));
      el.line.setAttribute("stroke-width", String(entry.strokeWidth));
      el.line.setAttribute("opacity", String(entry.opacity));
      if (entry.animate) {
        el.line.setAttribute("class", "edge-dash-animate");
      } else {
        el.line.removeAttribute("class");
      }

      const showLabel = Boolean(entry.label) && entry.opacity > 0.2;
      if (showLabel) {
        if (!el.labelBg) {
          const labelBg = document.createElementNS(SVG_NS, "rect");
          labelBg.setAttribute("rx", "4");
          labelBg.setAttribute("fill", theme.canvasBg);
          labelBg.setAttribute("stroke", theme.cardBorder);
          labelBg.setAttribute("stroke-width", "1");
          labelBg.setAttribute("class", "pointer-events-none select-none");
          el.g.appendChild(labelBg);
          el.labelBg = labelBg;
        }
        if (!el.label) {
          const label = document.createElementNS(SVG_NS, "text");
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("dominant-baseline", "middle");
          label.setAttribute("fill", theme.foreground);
          label.setAttribute("font-size", String(CHAINING_LABEL_FONT_SIZE));
          label.setAttribute("font-weight", "600");
          label.setAttribute("font-family", GRAPH_LABEL_FONT);
          label.setAttribute("class", "pointer-events-none select-none");
          el.g.appendChild(label);
          el.label = label;
        }
        el.label.setAttribute("x", String(entry.mx));
        el.label.setAttribute("y", String(entry.my));
        el.label.setAttribute("opacity", "1");
        if (el.labelText !== entry.label) {
          el.label.textContent = entry.label;
          el.labelText = entry.label;
        }

        let boxW = entry.label.length * (CHAINING_LABEL_FONT_SIZE * 0.58);
        let boxH = CHAINING_LABEL_FONT_SIZE + CHAINING_LABEL_PAD_Y * 2;
        try {
          const bbox = el.label.getBBox();
          if (bbox.width > 0) {
            boxW = bbox.width + CHAINING_LABEL_PAD_X * 2;
            boxH = bbox.height + CHAINING_LABEL_PAD_Y * 2;
          }
        } catch {
          boxW += CHAINING_LABEL_PAD_X * 2;
        }

        el.labelBg.setAttribute("x", String(entry.mx - boxW / 2));
        el.labelBg.setAttribute("y", String(entry.my - boxH / 2));
        el.labelBg.setAttribute("width", String(boxW));
        el.labelBg.setAttribute("height", String(boxH));
        el.labelBg.setAttribute("opacity", "1");
        el.labelBg.style.display = "";
        el.label.style.display = "";
      } else {
        if (el.labelBg) el.labelBg.style.display = "none";
        if (el.label) el.label.style.display = "none";
      }
    },
    [theme],
  );

  const syncOverlay = useCallback(() => {
    const graph = sigma.getGraph();
    const nodes = edgeRefs.current;
    const nextIds = new Set<string>();

    graph.forEachEdge((edge, attrs) => {
      const segment = computeSegment(edge, attrs, graph);
      if (!segment) return;
      nextIds.add(edge);
      applySegment(segment);
    });

    for (const [id, entry] of nodes) {
      if (!nextIds.has(id)) {
        entry.g.remove();
        nodes.delete(id);
      }
    }
  }, [sigma, computeSegment, applySegment]);

  const updatePositions = useCallback(() => {
    const graph = sigma.getGraph();
    for (const [edge, entry] of edgeRefs.current) {
      const attrs = graph.getEdgeAttributes(edge);
      const segment = computeSegment(edge, attrs, graph);
      if (!segment) {
        entry.g.style.display = "none";
        continue;
      }
      entry.g.style.display = "";
      entry.line.setAttribute("x1", String(segment.x1));
      entry.line.setAttribute("y1", String(segment.y1));
      entry.line.setAttribute("x2", String(segment.x2));
      entry.line.setAttribute("y2", String(segment.y2));
      if (entry.label && entry.labelBg) {
        entry.label.setAttribute("x", String(segment.mx));
        entry.label.setAttribute("y", String(segment.my));
        let boxW = segment.label.length * (CHAINING_LABEL_FONT_SIZE * 0.58);
        let boxH = CHAINING_LABEL_FONT_SIZE + CHAINING_LABEL_PAD_Y * 2;
        try {
          const bbox = entry.label.getBBox();
          if (bbox.width > 0) {
            boxW = bbox.width + CHAINING_LABEL_PAD_X * 2;
            boxH = bbox.height + CHAINING_LABEL_PAD_Y * 2;
          }
        } catch {
          boxW += CHAINING_LABEL_PAD_X * 2;
        }
        entry.labelBg.setAttribute("x", String(segment.mx - boxW / 2));
        entry.labelBg.setAttribute("y", String(segment.my - boxH / 2));
        entry.labelBg.setAttribute("width", String(boxW));
        entry.labelBg.setAttribute("height", String(boxH));
      }
    }
  }, [sigma, computeSegment]);

  useEffect(() => {
    for (const entry of edgeRefs.current.values()) {
      if (entry.labelBg) {
        entry.labelBg.setAttribute("fill", theme.canvasBg);
        entry.labelBg.setAttribute("stroke", theme.cardBorder);
      }
      if (entry.label) {
        entry.label.setAttribute("fill", theme.foreground);
      }
    }
  }, [theme]);

  useEffect(() => {
    syncOverlay();
  }, [syncOverlay, focusId, highlightEdges, hoveredEdge, theme]);

  useEffect(() => {
    const onCameraUpdate = () => {
      scheduleCameraRaf(rafRef, updatePositions);
    };

    const camera = sigma.getCamera();
    camera.on("updated", onCameraUpdate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      camera.off("updated", onCameraUpdate);
    };
  }, [sigma, updatePositions]);

  return (
    <svg
      ref={svgRef}
      className="graph-canvas-underlay pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

function SigmaDynamicSettings({
  focusId,
  hoveredEdge,
  highlightEdges,
  killchainGroups,
  theme,
}: {
  focusId: string | null;
  hoveredEdge: string | null;
  highlightEdges: Set<string>;
  killchainGroups: KillchainGroupLayout[];
  theme: GraphThemeColors;
}) {
  const sigma = useSigma();
  const setSettings = useSetSettings();
  const focusIdRef = useRef(focusId);
  const hoveredEdgeRef = useRef(hoveredEdge);
  focusIdRef.current = focusId;
  hoveredEdgeRef.current = hoveredEdge;

  const edgeType = GRAPH_RENDER_DEFAULTS.curvedEdges ? "curvedArrow" : "arrow";

  const nodeReducer = useCallback(
    (node: string, data: Record<string, unknown>) => {
      if (data.hidden) {
        return { ...data, hidden: true, label: "", type: "image" };
      }

      const currentFocus = focusIdRef.current;
      const labelsAlways = GRAPH_RENDER_DEFAULTS.nodeLabelsAlways;
      const dimmed = Boolean(data.dimmed);
      const highlighted = Boolean(data.highlighted);
      const inChain = Boolean(data.inChain);
      const baseSize = (data.baseSize as number) ?? (data.size as number);
      const objectType = data.objectType as GraphIconType | undefined;

      const res: Record<string, unknown> = {
        ...data,
        type: "image",
        color: theme.canvasBg,
      };

      if (objectType) {
        res.image = nodeIconUrl(objectType, {
          dimmed,
          highlighted,
          inChain: inChain && !highlighted && Boolean(currentFocus),
          canvasBg: theme.canvasBg,
        });
      }

      if (dimmed) {
        res.label = "";
        res.zIndex = 0;
        res.size = baseSize * 0.72;
      } else if (highlighted) {
        res.zIndex = 4;
        res.label = data.label;
        res.labelColor = theme.foreground;
        res.labelSize = 12;
      } else if (inChain && currentFocus && !labelsAlways) {
        res.zIndex = 2;
        res.label = "";
      } else if (currentFocus && !labelsAlways) {
        res.zIndex = 0;
        res.label = "";
        res.size = baseSize * 0.8;
      } else {
        res.zIndex = 1;
        res.label = data.label;
        res.labelColor = "#7a7a88";
      }

      return res;
    },
    [theme],
  );

  const edgeReducer = useCallback(
    (edge: string, data: Record<string, unknown>) => {
      const type = GRAPH_RENDER_DEFAULTS.curvedEdges ? "curvedArrow" : "arrow";

      if (data.hidden) {
        return { ...data, hidden: true, type, label: "" };
      }

      const kind = data.kind as string | undefined;
      if (kind === "chaining") {
        return { ...data, hidden: true, type, label: "" };
      }

      const currentFocus = focusIdRef.current;
      const renderEdgeLabels = GRAPH_RENDER_DEFAULTS.renderEdgeLabels;
      const baseColor = String(data.color ?? DETECTION_EDGE_COLOR);
      const dimmed = Boolean(data.dimmed);
      const inChain = Boolean(data.inChain);
      const isHovered = edge === hoveredEdgeRef.current;
      const baseSize = (data.baseSize as number) ?? (data.size as number) ?? 1;
      const label = String(data.label ?? "");
      const showLabel =
        Boolean(label) &&
        !dimmed &&
        (renderEdgeLabels || isHovered || (inChain && Boolean(currentFocus)));

      if (dimmed) {
        return {
          ...data,
          type,
          color: `${baseColor}0a`,
          size: baseSize * 0.4,
          label: "",
          forceLabel: false,
        };
      }

      if (inChain && currentFocus) {
        return {
          ...data,
          type,
          color: baseColor,
          size: baseSize * (isHovered ? 1.6 : 1.4),
          zIndex: isHovered ? 3 : 2,
          label: showLabel ? label : "",
          forceLabel: Boolean(showLabel),
          edgeLabelColor: baseColor,
        };
      }

      if (currentFocus) {
        return {
          ...data,
          type,
          color: `${baseColor}55`,
          size: baseSize * (isHovered ? 1.3 : 1),
          label: showLabel ? label : "",
          forceLabel: Boolean(showLabel),
          edgeLabelColor: baseColor,
        };
      }

      return {
        ...data,
        type,
        color: baseColor,
        size: baseSize * (isHovered ? 1.3 : 1),
        label: showLabel ? label : "",
        forceLabel: Boolean(showLabel),
        edgeLabelColor: baseColor,
      };
    },
    [],
  );

  const drawNodeLabel = useCallback<NodeLabelDrawingFunction>(
    (context, data, settings) => {
      drawGraphNodeLabel(
        context,
        data as Record<string, unknown>,
        settings,
        theme,
      );
    },
    [theme],
  );

  const drawNodeHover = useCallback<NodeHoverDrawingFunction>(() => {}, []);

  useEffect(() => {
    setSettings({
      nodeReducer,
      edgeReducer,
      defaultDrawNodeLabel: drawNodeLabel,
      defaultDrawNodeHover: drawNodeHover,
      defaultEdgeType: edgeType,
      renderEdgeLabels: GRAPH_RENDER_DEFAULTS.renderEdgeLabels,
      ...DEFAULT_GRAPH_RENDER_SETTINGS,
    });
    safeRefresh(sigma);
  }, [
    setSettings,
    nodeReducer,
    edgeReducer,
    drawNodeLabel,
    drawNodeHover,
    sigma,
    focusId,
    hoveredEdge,
    edgeType,
    theme,
  ]);

  return (
    <>
      <KillchainGroupsOverlay groups={killchainGroups} />
      {focusId || hoveredEdge ? (
        <ChainingEdgesOverlay
          focusId={focusId}
          highlightEdges={highlightEdges}
          hoveredEdge={hoveredEdge}
          theme={theme}
        />
      ) : null}
    </>
  );
}

export function SigmaGraphCanvas() {
  const {
    corpusGraph,
    bundle,
    visibleIds,
    hoveredId,
    selectedId,
    graphTopology,
    layoutNonce,
    killchainGrouping,
    showVocabNodes,
    vocabIndex,
  } = useExplorer();

  const deferredVisibleIds = useDeferredValue(visibleIds);
  const focusId = hoveredId ?? selectedId;
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [killchainGroups, setKillchainGroups] = useState<
    KillchainGroupLayout[]
  >([]);
  const [graphLoadedNonce, setGraphLoadedNonce] = useState(0);

  const killchainVocab = useMemo(
    () => vocabIndex.killchain ?? {},
    [vocabIndex],
  );

  const vocabLayer = useMemo(
    () =>
      showVocabNodes
        ? buildVocabGraphLayer(bundle, deferredVisibleIds, vocabIndex)
        : { nodes: [], edges: [] },
    [showVocabNodes, bundle, deferredVisibleIds, vocabIndex],
  );

  const effectiveVisibleIds = useMemo(
    () =>
      showVocabNodes
        ? expandVisibleIdsWithVocab(deferredVisibleIds, vocabLayer)
        : deferredVisibleIds,
    [showVocabNodes, deferredVisibleIds, vocabLayer],
  );

  const displayGraph = useMemo(
    () =>
      buildDisplayGraph(
        corpusGraph,
        bundle,
        deferredVisibleIds,
        showVocabNodes,
        vocabIndex,
      ),
    [corpusGraph, bundle, deferredVisibleIds, showVocabNodes, vocabIndex],
  );

  const onKillchainGroupsChange = useCallback(
    (groups: KillchainGroupLayout[]) => {
      setKillchainGroups(groups);
    },
    [],
  );

  const handleGraphLoaded = useCallback(() => {
    setGraphLoadedNonce((nonce) => nonce + 1);
    setKillchainGroups([]);
  }, []);

  const causalChain = useMemo(() => {
    if (!focusId) return { nodes: new Set<string>(), edges: new Set<string>() };
    const base = getCausalChain(corpusGraph, focusId);
    if (!showVocabNodes) return base;

    const nodes = new Set(base.nodes);
    const edges = new Set(base.edges);
    for (const edge of vocabLayer.edges) {
      if (edge.source !== focusId && edge.target !== focusId) continue;
      nodes.add(edge.source);
      nodes.add(edge.target);
      edges.add(edge.id);
    }
    return { nodes, edges };
  }, [corpusGraph, focusId, showVocabNodes, vocabLayer.edges]);

  const onHoverEdge = useCallback((edge: string | null) => {
    setHoveredEdge(edge);
  }, []);

  const graphTheme = useGraphThemeColors();

  if (visibleIds.size === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Network className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="text-lg font-medium">No objects match your search</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Try broadening your query or removing filter tokens to restore the
          corpus graph.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <SigmaContainer
        className="sigma-graph h-full w-full"
        settings={SIGMA_SETTINGS}
      >
        <SigmaAutoResize />
        <SigmaCameraLimits />
        <GraphLoader graph={displayGraph} onGraphLoaded={handleGraphLoaded} />
        <GraphLayoutApplier
          topology={graphTopology.topology}
          layoutNonce={layoutNonce}
          killchainGrouping={killchainGrouping}
          graphLoadedNonce={graphLoadedNonce}
          visibleIds={effectiveVisibleIds}
          killchainVocab={killchainVocab}
          onGroupsChange={onKillchainGroupsChange}
        />
        <SigmaDynamicSettings
          focusId={focusId}
          hoveredEdge={hoveredEdge}
          highlightEdges={causalChain.edges}
          killchainGroups={killchainGrouping ? killchainGroups : []}
          theme={graphTheme}
        />
        <GraphViewportControls />
        <GraphEvents onHoverEdge={onHoverEdge} />
        <GraphRefresh
          visibleIds={effectiveVisibleIds}
          hoveredId={hoveredId}
          selectedId={selectedId}
          highlightNodes={causalChain.nodes}
          highlightEdges={causalChain.edges}
        />
      </SigmaContainer>
    </div>
  );
}
