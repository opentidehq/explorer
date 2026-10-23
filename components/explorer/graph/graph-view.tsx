"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Graph from "graphology";
import Sigma from "sigma";
import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { extremityArrow, layerFill, pathCurved } from "sigma/rendering";
import { layerImage } from "@sigma/node-image";
import { animateNodes } from "sigma/utils";
import { useTheme } from "next-themes";
import {
  useCatalog,
  useDisplayedIds,
  useExplorer,
  useExplorerActions,
  useExplorerStore,
} from "@/components/explorer/explorer-state";
import { NoMatches } from "@/components/explorer/stage";
import {
  frameNodes,
  MAX_CAMERA_RATIO,
  MIN_CAMERA_RATIO,
} from "@/components/explorer/graph/camera";
import { GraphControls } from "@/components/explorer/graph/graph-controls";
import {
  FocusOverlay,
  KillchainBands,
} from "@/components/explorer/graph/graph-overlays";
import {
  GraphLegend,
  GraphStatus,
} from "@/components/explorer/graph/graph-legend";
import {
  getCausalChain,
  outEdges,
  inEdges,
  type CorpusGraph,
} from "@/lib/graph/corpus-graph";
import {
  applyForceAtlasLayout,
  applyGraphTopology,
  toGraphology,
  type GraphNodeKind,
} from "@/lib/graph/graph-layout";
import { computeLayout, type LayoutTargets } from "@/lib/graph/layout-client";
import {
  applyKillchainLayout,
  computeKillchainLayout,
  computeKillchainViewBBox,
  positionKillchainSatellites,
  restoreBasePositions,
  snapshotBasePositions,
  type KillchainGroupLayout,
} from "@/lib/graph/killchain-grouping";
import {
  mix,
  nodeBaseColor,
  nodeImage,
  readGraphPalette,
  type GraphPalette,
  type NodeState,
} from "@/lib/graph/node-images";
import { EDGE_CURVATURE } from "@/lib/graph/render-styles";
import {
  buildVocabGraphLayer,
  expandVisibleIdsWithVocab,
  isVocabNodeId,
  syncVocabLayer,
  type VocabGraphLayer,
} from "@/lib/graph/vocab-nodes";

/* The base graph: built once per corpus, laid out the first time it is shown. ------- */

/*
 * One graph per corpus holds every position for the life of the page: the view draws it,
 * layouts move it, and the vocabulary layer adds and drops its own nodes in it. A copy per
 * search would lose any layout written to it, and a new WebGL context per keystroke.
 */
const baseGraphs = new WeakMap<CorpusGraph, Graph>();
/** Base graphs whose ForceAtlas2 layout has run; the rest settle on screen when first shown. */
const settled = new WeakSet<Graph>();

/** The layout a base graph holds, so a view that mounts again knows what to change or undo. */
interface AppliedLayout {
  /** `topology:relayouts`, as the store names it. */
  key: string;
  killchain: boolean;
}
const appliedLayouts = new WeakMap<Graph, AppliedLayout>();
/** What a fresh base graph holds once ForceAtlas2 settles: the store's first layout. */
const FIRST_LAYOUT: AppliedLayout = { key: "force:0", killchain: false };

function baseGraphFor(corpus: CorpusGraph): Graph {
  let graph = baseGraphs.get(corpus);
  if (!graph) {
    const created = toGraphology(corpus);
    created.forEachNode((node, attrs) => {
      const degree =
        outEdges(corpus, node).length + inEdges(corpus, node).length;
      created.mergeNodeAttributes(node, {
        // Well-linked objects read a little larger.
        size: (attrs.size as number) + Math.min(5, Math.sqrt(degree) * 1.3),
        // Seeds for ForceAtlas2, the same in every browser.
        x: attrs.x as number,
        y: attrs.y as number,
      });
    });
    baseGraphs.set(corpus, created);
    graph = created;
  }
  return graph;
}

const EMPTY_LAYER: VocabGraphLayer = { nodes: [], edges: [] };

/** What the reducers read; kept in a ref so sigma never needs new settings to re-render. */
export interface GraphViewState {
  palette: GraphPalette;
  visible: Set<string>;
  matches: Set<string> | null;
  focus: string | null;
  selected: string | null;
  chainNodes: Set<string>;
  chainEdges: Set<string>;
  font: string;
  /** Nodes shrink on narrow stages so a phone still shows the shape of the corpus. */
  sizeScale: number;
}

function labelFont(): string {
  if (typeof document === "undefined") return "Inter, system-ui, sans-serif";
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-inter")
    .trim();
  return family
    ? `${family}, system-ui, sans-serif`
    : "Inter, system-ui, sans-serif";
}

function nodeState(node: string, s: GraphViewState): NodeState {
  if (s.focus) {
    if (node === s.focus || node === s.selected) return "focus";
    return s.chainNodes.has(node) ? "chain" : "dimmed";
  }
  if (node === s.selected) return "focus";
  if (s.matches && !s.matches.has(node)) return "context";
  return "normal";
}

/** Labels sit on a patch of the panel colour; the focus gets a pill in its type's colour. */
function labelStyle(kind: GraphNodeKind, focused: boolean, s: GraphViewState) {
  if (focused) {
    return {
      labelSize: 12.5,
      labelColor: s.palette.ink,
      backdropVisibility: "visible" as const,
      backdropArea: "label" as const,
      backdropColor: s.palette.panel,
      backdropBorderColor: s.palette.types[kind],
      backdropBorderWidth: 1.25,
      backdropCornerRadius: 11,
      backdropLabelPadding: 5,
      backdropShadowColor: "transparent",
      backdropShadowBlur: 0,
    };
  }
  return {
    labelSize: 11,
    labelColor: s.focus ? s.palette.ink : s.palette.subtle,
    labelBackgroundColor: s.palette.panel,
    labelBackgroundPadding: 1.5,
    backdropVisibility: "hidden" as const,
  };
}

/* The view --------------------------------------------------------------------------- */

export function GraphView() {
  const catalog = useCatalog();
  const actions = useExplorerActions();
  const store = useExplorerStore();
  const displayed = useDisplayedIds();
  const matchIds = useExplorer((s) => s.matchIds);
  const selectedId = useExplorer((s) => s.selectedId);
  const hoveredId = useExplorer((s) => s.hoveredId);
  const topology = useExplorer((s) => s.topology);
  const layoutNonce = useExplorer((s) => s.layoutNonce);
  const killchainGrouping = useExplorer((s) => s.killchainGrouping);
  const showVocabNodes = useExplorer((s) => s.showVocabNodes);
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const [sigma, setSigma] = useState<Sigma | null>(null);
  // The instance the DOM holds right now. Effects that run in the commit that replaces it
  // still see the old one in state; they must not touch a killed instance.
  const liveRef = useRef<Sigma | null>(null);
  // Finishes the first layout early; set while the ForceAtlas2 worker runs.
  const settleRef = useRef<(() => void) | null>(null);
  const [palette, setPalette] = useState<GraphPalette>(() =>
    readGraphPalette(),
  );
  const [groups, setGroups] = useState<KillchainGroupLayout[]>([]);

  const base = useMemo(() => baseGraphFor(catalog.corpus), [catalog.corpus]);
  const vocabLayer = useMemo(
    () =>
      showVocabNodes
        ? buildVocabGraphLayer(catalog.bundle, displayed, catalog.vocab)
        : EMPTY_LAYER,
    [showVocabNodes, catalog.bundle, catalog.vocab, displayed],
  );
  const visible = useMemo(
    () =>
      showVocabNodes
        ? expandVisibleIdsWithVocab(displayed, vocabLayer)
        : displayed,
    [showVocabNodes, displayed, vocabLayer],
  );

  const focus = hoveredId ?? selectedId;
  const chain = useMemo(() => {
    if (!focus) return { nodes: new Set<string>(), edges: new Set<string>() };
    const found = getCausalChain(catalog.corpus, focus);
    for (const edge of vocabLayer.edges) {
      if (edge.source !== focus && edge.target !== focus) continue;
      found.nodes.add(edge.source);
      found.nodes.add(edge.target);
      found.edges.add(edge.id);
    }
    return found;
  }, [catalog.corpus, focus, vocabLayer.edges]);

  const stateRef = useRef<GraphViewState>({
    palette,
    visible,
    matches: matchIds,
    focus,
    selected: selectedId,
    chainNodes: chain.nodes,
    chainEdges: chain.edges,
    font: "Inter, system-ui, sans-serif",
    sizeScale: 1,
  });
  // Sigma's reducers read the latest render state from this ref between React renders.
  // oxlint-disable-next-line react/refs
  stateRef.current = {
    // oxlint-disable-next-line react/refs
    ...stateRef.current,
    palette,
    visible,
    matches: matchIds,
    focus,
    selected: selectedId,
    chainNodes: chain.nodes,
    chainEdges: chain.edges,
  };

  // The theme decides every colour; read them again whenever it changes.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPalette(readGraphPalette()));
    return () => cancelAnimationFrame(raf);
  }, [resolvedTheme]);

  // The vocabulary layer lives in the base graph; sigma redraws as nodes come and go.
  useEffect(() => {
    syncVocabLayer(base, vocabLayer);
  }, [base, vocabLayer]);

  // One sigma for the base graph while the view is mounted.
  useEffect(() => {
    const graph = base;
    const container = containerRef.current;
    if (!container) return;
    const state = stateRef;
    const scaleFor = (width: number) =>
      Math.min(1, Math.max(0.62, width / 900));
    state.current.font = labelFont();
    state.current.sizeScale = scaleFor(container.clientWidth);

    const edgeLook = (edge: string, kind: string): Partial<EdgeDisplayData> => {
      const s = state.current;
      // Runs inside the constructor too, before `instance` exists: read the graph directly.
      const source = graph.source(edge);
      const target = graph.target(edge);
      if (!s.visible.has(source) || !s.visible.has(target)) {
        return { visibility: "hidden" };
      }
      const p = s.palette;
      if (s.focus) {
        // The focus's links are drawn by the overlay, with their flow and labels.
        if (s.chainEdges.has(edge)) return { visibility: "hidden" };
        return { color: mix(p.panel, p.ink, 0.06), size: 0.6, zIndex: 0 };
      }
      if (kind === "chaining") {
        return {
          color: mix(p.panel, p.types.threat, 0.38),
          size: 1,
          zIndex: 1,
        };
      }
      if (kind === "vocab") {
        return {
          color: mix(p.panel, p.types.vocab, 0.4),
          size: 0.7,
          zIndex: 1,
        };
      }
      return { color: mix(p.panel, p.accent, 0.5), size: 1.4, zIndex: 2 };
    };

    const instance = new Sigma(graph, container, {
      primitives: {
        nodes: {
          // The type colour under each node's icon.
          layers: [layerFill(), layerImage({ imageAttribute: "image" })],
          label: {
            font: { family: state.current.font, weight: "500", size: 11 },
            margin: 5,
          },
        },
        edges: {
          paths: [pathCurved()],
          // Edge-curve's v3 arrowhead proportions.
          extremities: [extremityArrow({ lengthRatio: 2.5, widthRatio: 2 })],
          defaultHead: "arrow",
        },
      },
      settings: {
        allowInvalidContainer: true,
        // Sizes are pixels at the default zoom, as they were before sigma 4.
        itemSizesReference: "screen",
        renderEdgeLabels: false,
        labelDensity: 0.05,
        labelGridCellSize: 140,
        labelRenderedSizeThreshold: 10,
        stagePadding: 48,
        minCameraRatio: MIN_CAMERA_RATIO,
        maxCameraRatio: MAX_CAMERA_RATIO,
        hideEdgesOnMove: false,
      },
      nodeReducer: (node, data, attrs) => {
        const s = state.current;
        const kind =
          (attrs.objectType as GraphNodeKind | undefined) ?? "threat";
        if (!s.visible.has(node)) {
          return { visibility: "hidden", labelVisibility: "hidden" };
        }
        const look = nodeState(node, s);
        const size = data.size * s.sizeScale;
        const res: Partial<NodeDisplayData> & { image: string } = {
          ...labelStyle(kind, look === "focus", s),
          labelFont: s.font,
          color: nodeBaseColor(kind, s.palette),
          image: nodeImage(kind, look, s.palette),
          highlighted: look === "focus",
          labelVisibility: "auto",
          // Sigma sets the stage cursor from the item under the pointer.
          cursor: "pointer",
        };
        switch (look) {
          case "focus":
            res.size = size * 1.45;
            // labelDepth follows depth only in styles, which run before this reducer.
            res.depth = "topNodes";
            res.labelDepth = "topNodes";
            res.labelVisibility = "visible";
            break;
          case "chain":
            res.size = size * 1.12;
            res.zIndex = 3;
            // Small chains name every member; larger ones leave it to the label grid.
            if (s.chainNodes.size <= 6) res.labelVisibility = "visible";
            break;
          case "dimmed":
            res.size = size * 0.8;
            res.zIndex = 0;
            res.labelVisibility = "hidden";
            break;
          case "context":
            res.size = size * 0.9;
            res.zIndex = 1;
            break;
          default:
            res.zIndex = 2;
            if (s.matches && s.matches.size <= 8) {
              res.labelVisibility = "visible";
            }
        }
        return res;
      },
      edgeReducer: (edge, _data, attrs) => ({
        // pathCurved's own `curvature` option is not read in sigma 4.0.3; set it per edge.
        curvature: EDGE_CURVATURE,
        ...edgeLook(edge, attrs.kind as string),
      }),
    });

    instance.on("clickNode", ({ node }) => {
      if (isVocabNodeId(node)) return;
      const current = store.get().selectedId;
      actions.select(node === current ? null : node);
    });
    // A pan ends with a click on the stage; only a click that stayed put deselects.
    let downAt: { x: number; y: number } | null = null;
    instance.on("downStage", ({ event }) => {
      downAt = { x: event.x, y: event.y };
    });
    instance.on("clickStage", ({ event }) => {
      const moved = downAt
        ? Math.hypot(event.x - downAt.x, event.y - downAt.y)
        : 0;
      downAt = null;
      if (moved < 5) actions.select(null);
    });
    instance.on("enterNode", ({ node }) => {
      if (!isVocabNodeId(node)) actions.hover(node);
    });
    instance.on("leaveNode", () => {
      actions.hover(null);
    });

    // The first time a corpus is drawn, ForceAtlas2 runs in a worker while the page stays
    // responsive; the nodes then bloom from the centre to their places. Reduced motion
    // places them at once.
    let job: { cancel: () => void } | null = null;
    let stopTween: (() => void) | null = null;
    let targets: LayoutTargets | null = null;
    const settle = (frame = true) => {
      job?.cancel();
      job = null;
      container.style.opacity = "1";
      stopTween?.();
      stopTween = null;
      settleRef.current = null;
      if (targets) {
        for (const [node, point] of Object.entries(targets)) {
          if (graph.hasNode(node)) graph.mergeNodeAttributes(node, point);
        }
      } else if (!settled.has(graph)) {
        // Stopped before the worker answered: lay out here.
        applyForceAtlasLayout(graph);
      }
      instance.setCustomBBox(null);
      snapshotBasePositions(graph, { force: true });
      settled.add(graph);
      if (!frame) return;
      instance.refresh();
      // A permalink's object or a search's matches sat in the packed centre: frame them.
      const selected = store.get().selectedId;
      const data = selected ? instance.getNodeDisplayData(selected) : null;
      if (data && data.visibility !== "hidden") {
        void instance
          .getCamera()
          .animate({ x: data.x, y: data.y, ratio: 0.55 }, { duration: 700 });
      } else if (store.get().matchIds) {
        frameNodes(instance, state.current.visible, 700);
      }
    };
    if (!settled.has(graph) && graph.order > 1) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      settleRef.current = () => settle();
      // The seeds are noise: show nothing until the layout is known.
      container.style.opacity = "0";
      const running = computeLayout(graph);
      job = running;
      void running.result.then((result) => {
        if (job !== running) return;
        job = null;
        targets = result;
        container.style.transition = "opacity 500ms ease-out";
        container.style.opacity = "1";
        if (reduced) {
          settle();
          return;
        }
        // Frame the final layout from the start, so the bloom fills the stage.
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const point of Object.values(result)) {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }
        instance.setCustomBBox({ x: [minX, maxX], y: [minY, maxY] });
        stopTween = animateNodes(
          graph,
          result,
          { duration: 1100, easing: "cubicOut" },
          () => {
            stopTween = null;
            settle();
          },
        );
      });
    }

    const observer = new ResizeObserver(() => {
      state.current.sizeScale = scaleFor(container.clientWidth);
      instance.resize();
      instance.refresh();
    });
    observer.observe(container);

    liveRef.current = instance;
    setSigma(instance);
    return () => {
      // Leaving mid-layout: land every node where the layout puts it.
      if (settleRef.current) settle(false);
      observer.disconnect();
      if (liveRef.current === instance) liveRef.current = null;
      instance.kill();
      setSigma(null);
    };
  }, [base, actions, store]);

  // Any change to what the reducers read: one refresh.
  useEffect(() => {
    if (!sigma || sigma !== liveRef.current) return;
    sigma.refresh();
  }, [sigma, palette, visible, matchIds, focus, selectedId, chain]);

  // Layout: topology, re-runs, and kill chain grouping, written to the base graph. On mount
  // there is nothing to do unless the store asks for another layout than the graph holds.
  const layoutKey = `${topology}:${layoutNonce}`;
  useEffect(() => {
    if (!sigma || sigma !== liveRef.current) return;
    const applied = appliedLayouts.get(base) ?? FIRST_LAYOUT;
    const keyChanged = applied.key !== layoutKey;
    if (!keyChanged && !killchainGrouping && !applied.killchain) return;

    // A layout change while the first layout still runs: land it first, so the worker
    // cannot overwrite the new positions.
    settleRef.current?.();

    // Kill chain positions are a view over the layout; leave them before changing it.
    if (applied.killchain && (keyChanged || !killchainGrouping)) {
      restoreBasePositions(base);
    }
    if (keyChanged) {
      applyGraphTopology(base, topology);
      snapshotBasePositions(base, { force: true });
    } else if (killchainGrouping && !applied.killchain) {
      snapshotBasePositions(base, { force: true });
    }

    if (killchainGrouping) {
      const { positions, groups: next } = computeKillchainLayout(
        catalog.bundle,
        visible,
        catalog.vocab.killchain,
      );
      applyKillchainLayout(base, positions);
      positionKillchainSatellites(base, visible, positions);
      // The band overlay follows the layout this effect just wrote to sigma.
      // oxlint-disable-next-line react/set-state-in-effect
      setGroups(next);
      sigma.setCustomBBox(computeKillchainViewBBox(next, base, visible));
    } else {
      setGroups([]);
      sigma.setCustomBBox(null);
    }
    appliedLayouts.set(base, { key: layoutKey, killchain: killchainGrouping });
    sigma.refresh();
    void sigma.getCamera().reset({ duration: 450 });
  }, [
    sigma,
    base,
    killchainGrouping,
    layoutKey,
    topology,
    catalog.bundle,
    catalog.vocab,
    visible,
  ]);

  // A new search frames what it found; clearing it returns to the whole graph.
  const lastMatches = useRef(matchIds);
  useEffect(() => {
    if (!sigma || sigma !== liveRef.current || lastMatches.current === matchIds)
      return;
    lastMatches.current = matchIds;
    if (killchainGrouping) return;
    const id = requestAnimationFrame(() => {
      if (sigma !== liveRef.current) return;
      if (matchIds) frameNodes(sigma, visible);
      else void sigma.getCamera().reset({ duration: 500 });
    });
    return () => cancelAnimationFrame(id);
  }, [sigma, matchIds, visible, killchainGrouping]);

  // Selecting from elsewhere (inspector, palette, catalogue) flies to the node if it is off
  // in a corner or out of view.
  useEffect(() => {
    if (!sigma || sigma !== liveRef.current || !selectedId) return;
    const data = sigma.getNodeDisplayData(selectedId);
    if (!data) return;
    const point = sigma.framedGraphToViewport(data);
    const { width, height } = sigma.getDimensions();
    const inside =
      point.x > width * 0.15 &&
      point.x < width * 0.85 &&
      point.y > height * 0.15 &&
      point.y < height * 0.85;
    if (!inside) {
      void sigma
        .getCamera()
        .animate(
          { x: data.x, y: data.y },
          { duration: 550, easing: "quadraticInOut" },
        );
    }
  }, [sigma, selectedId]);

  // The sigma container stays mounted through a search that matches nothing: the instance
  // is bound to it, and a new element would leave the graph drawing nowhere.
  const empty = displayed.size === 0;

  return (
    <div className="sigma-stage tide-stage-grid relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      {sigma && !empty ? (
        <>
          <KillchainBands sigma={sigma} groups={groups} palette={palette} />
          <FocusOverlay
            sigma={sigma}
            focus={focus}
            selected={selectedId}
            chainEdges={chain.edges}
            palette={palette}
          />
          <GraphControls sigma={sigma} visible={visible} />
        </>
      ) : null}
      {empty ? (
        <div className="absolute inset-0 z-10 bg-panel">
          <NoMatches />
        </div>
      ) : (
        <>
          <GraphStatus visible={visible} />
          <GraphLegend showVocab={showVocabNodes} />
        </>
      )}
    </div>
  );
}
