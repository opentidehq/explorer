"use client";

import { useEffect, useMemo } from "react";
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import type Graph from "graphology";
import { useExplorer } from "@/components/shell/explorer-context";

function GraphLoader({ graph }: { graph: Graph }) {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    loadGraph(graph);
  }, [graph, loadGraph]);

  return null;
}

function GraphEvents() {
  const { setSelectedId } = useExplorer();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => setSelectedId(node),
      clickStage: () => setSelectedId(null),
    });
  }, [registerEvents, setSelectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedId]);

  return null;
}

function GraphHighlights() {
  const { filteredGraph, selectedId } = useExplorer();
  const sigma = useSigma();

  useEffect(() => {
    const graph = sigma.getGraph();
    graph.forEachNode((node, attrs) => {
      const isSelected = node === selectedId;
      const isNeighbor =
        Boolean(selectedId) &&
        (graph.outNeighbors(selectedId!).includes(node) ||
          graph.inNeighbors(selectedId!).includes(node));

      graph.setNodeAttribute(node, "highlighted", isSelected || isNeighbor);
      graph.setNodeAttribute(
        node,
        "size",
        isSelected ? (attrs.size as number) * 1.35 : (attrs.size as number),
      );
    });
  }, [selectedId, sigma, filteredGraph]);

  return null;
}

export function SigmaGraphCanvas() {
  const { filteredGraph, selectedId } = useExplorer();

  const settings = useMemo(
    () => ({
      renderLabels: true,
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 11,
      labelWeight: "500",
      labelColor: { color: "#9898a8" },
      defaultNodeType: "circle",
      defaultEdgeType: "arrow",
      labelDensity: 0.07,
      labelGridCellSize: 90,
      zIndex: true,
      nodeReducer: (node: string, data: Record<string, unknown>) => {
        const highlighted = Boolean(data.highlighted);
        const res: Record<string, unknown> = { ...data, type: "circle" };
        if (highlighted) {
          res.zIndex = 2;
        } else if (selectedId && node !== selectedId) {
          res.color = `${data.color}99`;
          res.zIndex = 0;
        }
        return res;
      },
      edgeReducer: (_edge: string, data: Record<string, unknown>) => {
        const color = String(data.color ?? "#6366f1");
        return {
          ...data,
          color: selectedId ? `${color}55` : color,
        };
      },
    }),
    [selectedId],
  );

  if (filteredGraph.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-medium">No objects match your filters</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Try broadening your search or clearing filter chips to restore the
          corpus graph.
        </p>
      </div>
    );
  }

  return (
    <SigmaContainer
      className="h-full w-full !bg-transparent"
      settings={settings}
    >
      <GraphLoader graph={filteredGraph.graphology} />
      <GraphEvents />
      <GraphHighlights />
    </SigmaContainer>
  );
}
