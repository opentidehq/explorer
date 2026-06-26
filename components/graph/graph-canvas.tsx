"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Button } from "@/components/ui/button";
import { useExplorer } from "@/components/shell/explorer-context";
import { chainResolver, childs, getType, parents } from "@/lib/opentide/graph";
import { TYPE_COLORS, type ObjectType } from "@/lib/opentide/types";
import { ObjectDetailPanel } from "@/components/objects/object-detail-panel";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR",
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

function buildDetectionChain(
  ctx: ReturnType<typeof import("@/lib/opentide/graph").createGraphContext>,
  focusId: string | null,
  getName: (id: string) => string,
): { nodes: Node[]; edges: Edge[]; activeIds: Set<string> } {
  const startId =
    focusId ??
    Object.keys(ctx.models.threat)[0] ??
    Object.keys(ctx.flatIndex)[0];
  if (!startId) return { nodes: [], edges: [], activeIds: new Set() };

  const visited = new Set<string>();
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const activeIds = new Set<string>();

  function walk(id: string, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    activeIds.add(id);

    const type = getType(ctx, id, true) ?? "threat";
    const color = TYPE_COLORS[type as ObjectType];

    nodes.push({
      id,
      type: "default",
      data: { label: getName(id), objectType: type },
      position: { x: 0, y: depth * 80 },
      style: {
        background: `${color}22`,
        border: `2px solid ${color}`,
        borderRadius: type === "rule" ? 8 : type === "signal" ? 999 : 4,
        color: "#e8e8ed",
        fontSize: 12,
        width: NODE_WIDTH,
        padding: 8,
      },
    });

    for (const child of childs(ctx, id)) {
      const childType = getType(ctx, child, true);
      const label =
        childType === "signal"
          ? "|signal|"
          : childType === "rule"
            ? "|rule|"
            : "|threat|";
      edges.push({
        id: `${id}-${child}`,
        source: id,
        target: child,
        label,
        labelStyle: {
          fill: "#9898a8",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
        style: { stroke: "#6366f1" },
      });
      walk(child, depth + 1);
    }
  }

  let root = startId;
  while (true) {
    const p = parents(ctx, root);
    if (!p.length || !p[0]) break;
    root = p[0];
  }
  walk(root, 0);

  return { nodes, edges, activeIds };
}

function buildChainingGraph(
  ctx: ReturnType<typeof import("@/lib/opentide/graph").createGraphContext>,
  focusId: string | null,
  getName: (id: string) => string,
): { nodes: Node[]; edges: Edge[] } {
  const entry =
    focusId && getType(ctx, focusId, true) === "threat"
      ? focusId
      : Object.keys(ctx.models.threat)[0];
  if (!entry) return { nodes: [], edges: [] };

  const chain = chainResolver(ctx, entry);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const seen = new Set<string>();

  function addNode(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const type = getType(ctx, id, true) ?? "threat";
    nodes.push({
      id,
      data: { label: getName(id) },
      position: { x: 0, y: 0 },
      style: {
        background: `${TYPE_COLORS[type as ObjectType]}22`,
        border: `2px solid ${TYPE_COLORS[type as ObjectType]}`,
        borderRadius: 6,
        padding: 8,
        width: NODE_WIDTH,
        fontSize: 11,
      },
    });
  }

  addNode(entry);
  const relations = chain[entry] ?? {};
  for (const [relation, targets] of Object.entries(relations)) {
    for (const target of targets) {
      addNode(target);
      edges.push({
        id: `${entry}-${relation}-${target}`,
        source: entry,
        target,
        label: relation,
        labelStyle: {
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fill: "#c9a000",
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  }

  return { nodes, edges };
}

export function GraphCanvas() {
  const {
    graphContext,
    focusId,
    setFocusId,
    graphSubMode,
    setGraphSubMode,
    getSummary,
    pushBreadcrumb,
    bundle,
  } = useExplorer();

  const getName = useCallback(
    (id: string) => getSummary(id)?.name ?? id.slice(0, 8),
    [getSummary],
  );

  const graphData = useMemo(() => {
    if (graphSubMode === "chaining") {
      return buildChainingGraph(graphContext, focusId, getName);
    }
    return buildDetectionChain(graphContext, focusId, getName);
  }, [graphContext, focusId, graphSubMode, getName]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphData.edges);

  useEffect(() => {
    const direction = graphSubMode === "chaining" ? "LR" : "TB";
    const laid = layoutGraph(graphData.nodes, graphData.edges, direction);
    setNodes(laid);
    setEdges(graphData.edges);
  }, [graphData, graphSubMode, setNodes, setEdges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "g" || e.key === "G") {
        setGraphSubMode(
          graphSubMode === "detection" ? "chaining" : "detection",
        );
      }
      if (e.key === "Escape") setFocusId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [graphSubMode, setGraphSubMode, setFocusId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setFocusId(node.id);
      const summary = getSummary(node.id);
      if (summary) pushBreadcrumb(summary);
    },
    [setFocusId, getSummary, pushBreadcrumb],
  );

  const focusSummary = focusId ? getSummary(focusId) : null;
  const focusBody = focusId ? bundle.flatIndex[focusId] : null;

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          <Button
            size="sm"
            variant={graphSubMode === "detection" ? "secondary" : "outline"}
            onClick={() => setGraphSubMode("detection")}
          >
            Detection chain
          </Button>
          <Button
            size="sm"
            variant={graphSubMode === "chaining" ? "secondary" : "outline"}
            onClick={() => setGraphSubMode("chaining")}
          >
            Threat chaining
          </Button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          className="bg-background"
        >
          <Background gap={16} color="#2a2a38" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const t = (n.data as { objectType?: string })?.objectType;
              return TYPE_COLORS[t as ObjectType] ?? "#6366f1";
            }}
          />
        </ReactFlow>
      </div>
      {focusSummary && focusBody && (
        <ObjectDetailPanel summary={focusSummary} body={focusBody} />
      )}
    </div>
  );
}
