import type Graph from "graphology";
import type { ExplorerBundle, ObjectBody } from "@/lib/opentide/types";
import { lookupVocabTerm, type VocabTerm } from "@/lib/opentide/vocab";

export const KILLCHAIN_STAGE_ORDER = [
  "Initial Foothold",
  "Network Propagation",
  "Action on Objectives",
  "Unassigned",
] as const;

export type KillchainStage = (typeof KILLCHAIN_STAGE_ORDER)[number];

export interface KillchainGroupLayout {
  stage: KillchainStage;
  label: string;
  nodeIds: string[];
  centerX: number;
  centerY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const STAGE_GAP = 5.2;
const BOX_PADDING = 0.85;
const NODE_SPACING = 0.42;
const COLUMNS = 4;
const SATELLITE_ORBIT = 0.55;
const VIEW_BBOX_PADDING = 0.9;

const SATELLITE_RING: Record<string, number> = {
  objective: 0.75,
  signal: 1.15,
  rule: 1.45,
};

export function getThreatKillchain(
  body: ObjectBody | undefined,
): string | null {
  const threat = body?.["threat"] as ObjectBody | undefined;
  const value = threat?.["killchain"];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) return entry.trim();
    }
  }
  return null;
}

export function resolveKillchainStage(
  killchain: string | null,
  vocab: Record<string, VocabTerm> | undefined,
): KillchainStage {
  if (!killchain || !vocab) return "Unassigned";
  const term =
    vocab[killchain] ??
    vocab[killchain.trim()] ??
    lookupVocabTerm({ killchain: vocab }, "killchain", killchain);
  const stage = term?.stage;
  if (
    stage === "Initial Foothold" ||
    stage === "Network Propagation" ||
    stage === "Action on Objectives"
  ) {
    return stage;
  }
  return "Unassigned";
}

export function computeKillchainLayout(
  bundle: ExplorerBundle,
  visibleIds: Set<string>,
  vocab: Record<string, VocabTerm> | undefined,
): {
  positions: Map<string, { x: number; y: number }>;
  groups: KillchainGroupLayout[];
} {
  const byStage = new Map<KillchainStage, string[]>();

  for (const stage of KILLCHAIN_STAGE_ORDER) {
    byStage.set(stage, []);
  }

  for (const summary of bundle.summaries) {
    if (summary.type !== "threat" || !visibleIds.has(summary.uuid)) continue;
    const body = bundle.flatIndex[summary.uuid];
    const killchain = getThreatKillchain(body);
    const stage = resolveKillchainStage(killchain, vocab);
    byStage.get(stage)!.push(summary.uuid);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const groups: KillchainGroupLayout[] = [];

  KILLCHAIN_STAGE_ORDER.forEach((stage, stageIndex) => {
    const nodeIds = byStage.get(stage) ?? [];
    if (!nodeIds.length) return;

    nodeIds.sort((a, b) => {
      const nameA = bundle.summaries.find((s) => s.uuid === a)?.name ?? a;
      const nameB = bundle.summaries.find((s) => s.uuid === b)?.name ?? b;
      return nameA.localeCompare(nameB);
    });

    const centerX =
      (stageIndex - (KILLCHAIN_STAGE_ORDER.length - 1) / 2) * STAGE_GAP;
    const centerY = 0;
    const rows = Math.ceil(nodeIds.length / COLUMNS);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    nodeIds.forEach((id, index) => {
      const col = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x =
        centerX +
        (col - (Math.min(nodeIds.length, COLUMNS) - 1) / 2) * NODE_SPACING;
      const y = centerY + (row - (rows - 1) / 2) * NODE_SPACING;
      positions.set(id, { x, y });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    groups.push({
      stage,
      label: stage,
      nodeIds,
      centerX,
      centerY,
      minX: minX - BOX_PADDING,
      maxX: maxX + BOX_PADDING,
      minY: minY - BOX_PADDING - 0.35,
      maxY: maxY + BOX_PADDING,
    });
  });

  return { positions, groups };
}

export function snapshotBasePositions(
  graph: Graph,
  options: { force?: boolean } = {},
): void {
  const { force = false } = options;
  graph.forEachNode((node, attrs) => {
    if (typeof attrs.x !== "number" || typeof attrs.y !== "number") return;
    if (force || attrs.baseX == null) {
      graph.setNodeAttribute(node, "baseX", attrs.x);
    }
    if (force || attrs.baseY == null) {
      graph.setNodeAttribute(node, "baseY", attrs.y);
    }
  });
}

export function applyKillchainLayout(
  graph: Graph,
  positions: Map<string, { x: number; y: number }>,
): void {
  for (const [id, point] of positions) {
    if (!graph.hasNode(id)) continue;
    graph.setNodeAttribute(id, "x", point.x);
    graph.setNodeAttribute(id, "y", point.y);
  }
}

function hashCoord(id: string, salt: number): number {
  let hash = salt;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (hash % 1000) / 1000;
}

function findNearestThreatPosition(
  graph: Graph,
  nodeId: string,
  threatPositions: Map<string, { x: number; y: number }>,
): { x: number; y: number } | null {
  const queue = [nodeId];
  const seen = new Set<string>([nodeId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const threatPoint = threatPositions.get(current);
    if (threatPoint) return threatPoint;

    graph.forEachNeighbor(current, (neighbor) => {
      if (seen.has(neighbor)) return;
      seen.add(neighbor);
      queue.push(neighbor);
    });
  }

  return null;
}

/** Place non-threat visible nodes near their linked threats so the stage bands stay in view. */
export function positionKillchainSatellites(
  graph: Graph,
  visibleIds: Set<string>,
  threatPositions: Map<string, { x: number; y: number }>,
): void {
  if (!threatPositions.size) return;

  const fallbackY =
    Math.max(...[...threatPositions.values()].map((point) => point.y)) + 1.8;

  graph.forEachNode((node, attrs) => {
    if (!visibleIds.has(node) || attrs.objectType === "threat") return;

    const anchor =
      findNearestThreatPosition(graph, node, threatPositions) ??
      ({
        x: 0,
        y: fallbackY,
      } as const);

    const ring = SATELLITE_RING[String(attrs.objectType)] ?? 1;
    const angle = hashCoord(node, 17) * Math.PI * 2;
    const radial = SATELLITE_ORBIT * ring;

    graph.setNodeAttribute(node, "x", anchor.x + Math.cos(angle) * radial);
    graph.setNodeAttribute(
      node,
      "y",
      anchor.y + Math.sin(angle) * radial + ring * 0.35,
    );
  });
}

export interface KillchainViewBBox {
  x: [number, number];
  y: [number, number];
}

export function computeKillchainViewBBox(
  groups: KillchainGroupLayout[],
  graph: Graph,
  visibleIds: Set<string>,
  padding = VIEW_BBOX_PADDING,
): KillchainViewBBox | null {
  if (!groups.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const group of groups) {
    minX = Math.min(minX, group.minX);
    maxX = Math.max(maxX, group.maxX);
    minY = Math.min(minY, group.minY);
    maxY = Math.max(maxY, group.maxY);
  }

  graph.forEachNode((node, attrs) => {
    if (!visibleIds.has(node) || attrs.hidden) return;
    if (typeof attrs.x !== "number" || typeof attrs.y !== "number") return;
    const size = (attrs.size as number | undefined) ?? 0.35;
    minX = Math.min(minX, attrs.x - size);
    maxX = Math.max(maxX, attrs.x + size);
    minY = Math.min(minY, attrs.y - size);
    maxY = Math.max(maxY, attrs.y + size);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  return {
    x: [minX - padding, maxX + padding],
    y: [minY - padding, maxY + padding],
  };
}

export function restoreBasePositions(graph: Graph): void {
  graph.forEachNode((node, attrs) => {
    if (typeof attrs.baseX === "number" && typeof attrs.baseY === "number") {
      graph.setNodeAttribute(node, "x", attrs.baseX);
      graph.setNodeAttribute(node, "y", attrs.baseY);
    }
  });
}
