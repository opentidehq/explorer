"use client";

import { useEffect, useRef, useState } from "react";
import type Sigma from "sigma";
import { DEFAULT_EDGE_CURVATURE } from "@sigma/edge-curve";
import { useCatalog, useExplorer } from "@/components/explorer/explorer-state";
import { TypeIcon } from "@/components/ui/tide";
import { inEdges, outEdges } from "@/lib/graph/corpus-graph";
import type { KillchainGroupLayout } from "@/lib/graph/killchain-grouping";
import { mix, type GraphPalette } from "@/lib/graph/node-images";
import { TYPE_LABELS } from "@/lib/graph/type-icons";

/** Call `draw` after every sigma render, at most once per frame. */
function useAfterRender(sigma: Sigma, draw: () => void) {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    let frame = 0;
    let dead = false;
    const schedule = () => {
      if (!frame && !dead) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!dead) drawRef.current();
        });
      }
    };
    // A killed instance has no display data; stop drawing for it at once.
    const onKill = () => {
      dead = true;
      cancelAnimationFrame(frame);
    };
    sigma.on("afterRender", schedule);
    sigma.on("kill", onKill);
    schedule();
    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      sigma.off("afterRender", schedule);
      sigma.off("kill", onKill);
    };
  }, [sigma]);
}

interface Point {
  x: number;
  y: number;
}

function nodeAt(sigma: Sigma, id: string): (Point & { r: number }) | null {
  const data = sigma.getNodeDisplayData(id);
  if (!data || data.hidden) return null;
  const point = sigma.framedGraphToViewport(data);
  return { ...point, r: sigma.scaleSize(data.size) };
}

function bezier(t: number, a: Point, c: Point, b: Point): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

/** The parameter where the curve leaves a circle of radius `r` around `center`. */
function exitParameter(
  a: Point,
  c: Point,
  b: Point,
  center: Point,
  r: number,
  fromEnd: boolean,
): number {
  let lo = fromEnd ? 0.5 : 0;
  let hi = fromEnd ? 1 : 0.5;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    const p = bezier(mid, a, c, b);
    const inside = Math.hypot(p.x - center.x, p.y - center.y) < r;
    if (fromEnd ? inside : !inside) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

interface DrawnEdge {
  id: string;
  d: string;
  head: string;
  label: string | null;
  lx: number;
  ly: number;
  direct: boolean;
  kind: string;
}

/** Field names the links travel on, as the spec writes them. */
function edgeField(
  kind: string,
  label: string,
  targetType: string | undefined,
): string {
  if (kind === "chaining") return label;
  if (targetType === "objective") return "threats";
  if (targetType === "signal") return "signals[]";
  if (targetType === "rule") return "detection_model";
  return label;
}

/**
 * The focus and everything on its chain: links drawn as the same curves sigma draws, with a
 * moving dash along them (opentide.org's flow), field names on the focus's own links, and a
 * ripple under the selected object.
 */
export function FocusOverlay({
  sigma,
  focus,
  selected,
  chainEdges,
  palette,
}: {
  sigma: Sigma;
  focus: string | null;
  selected: string | null;
  chainEdges: Set<string>;
  palette: GraphPalette;
}) {
  const { corpus } = useCatalog();
  const [edges, setEdges] = useState<DrawnEdge[]>([]);
  const [ring, setRing] = useState<(Point & { r: number }) | null>(null);
  const [peek, setPeek] = useState<(Point & { r: number }) | null>(null);
  const hoveredId = useExplorer((s) => s.hoveredId);

  useAfterRender(sigma, () => {
    const graph = sigma.getGraph();
    const next: DrawnEdge[] = [];
    if (focus) {
      for (const id of chainEdges) {
        if (!graph.hasEdge(id)) continue;
        const sourceId = graph.source(id);
        const targetId = graph.target(id);
        const s = nodeAt(sigma, sourceId);
        const t = nodeAt(sigma, targetId);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const length = Math.hypot(dx, dy);
        if (length < s.r + t.r + 4) continue;
        const k =
          (graph.getEdgeAttribute(id, "curvature") as number | undefined) ??
          DEFAULT_EDGE_CURVATURE;
        const control = {
          x: (s.x + t.x) / 2 + dy * k,
          y: (s.y + t.y) / 2 - dx * k,
        };
        const t0 = exitParameter(s, control, t, s, s.r + 2, false);
        const t1 = exitParameter(s, control, t, t, t.r + 3, true);
        const a = bezier(t0, s, control, t);
        const b = bezier(t1, s, control, t);
        const before = bezier(Math.max(t0, t1 - 0.02), s, control, t);
        const ux = b.x - before.x;
        const uy = b.y - before.y;
        const ul = Math.hypot(ux, uy) || 1;
        const nx = ux / ul;
        const ny = uy / ul;
        const bx = b.x - nx * 7;
        const by = b.y - ny * 7;
        // Re-derive the control point for the trimmed span so it hugs the same curve.
        const cTrim = {
          x:
            (1 - t0) * (1 - t1) * s.x +
            ((1 - t0) * t1 + t0 * (1 - t1)) * control.x +
            t0 * t1 * t.x,
          y:
            (1 - t0) * (1 - t1) * s.y +
            ((1 - t0) * t1 + t0 * (1 - t1)) * control.y +
            t0 * t1 * t.y,
        };
        const mid = bezier(0.5, s, control, t);
        const direct = sourceId === focus || targetId === focus;
        const kind = String(graph.getEdgeAttribute(id, "kind") ?? "detection");
        next.push({
          id,
          d: `M${a.x},${a.y} Q${cTrim.x},${cTrim.y} ${b.x},${b.y}`,
          head: `M${b.x},${b.y} L${bx - ny * 3.5},${by + nx * 3.5} L${bx + ny * 3.5},${by - nx * 3.5} Z`,
          label: direct
            ? edgeField(
                kind,
                String(graph.getEdgeAttribute(id, "label") ?? ""),
                corpus.nodeById.get(targetId)?.type,
              )
            : null,
          lx: mid.x,
          ly: mid.y,
          direct,
          kind,
        });
      }
    }
    setEdges((current) =>
      next.length === 0 && current.length === 0 ? current : next,
    );
    setRing(selected ? nodeAt(sigma, selected) : null);
    setPeek(
      hoveredId && hoveredId !== selected ? nodeAt(sigma, hoveredId) : null,
    );
  });

  const accent = palette.accent;
  const faint = mix(palette.panel, palette.accent, 0.45);

  return (
    <>
      <svg
        aria-hidden
        className="graph-underlay pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        {edges.map((edge) => (
          <g key={edge.id}>
            <path
              d={edge.d}
              fill="none"
              stroke={edge.direct ? accent : faint}
              strokeWidth={edge.direct ? 1.75 : 1.25}
              strokeDasharray={edge.kind === "chaining" ? "5 4" : undefined}
              opacity={edge.direct ? 0.9 : 0.75}
            />
            <path d={edge.head} fill={edge.direct ? accent : faint} />
            {edge.kind !== "chaining" ? (
              <path
                d={edge.d}
                fill="none"
                className="tide-flow"
                stroke={accent}
                strokeWidth={edge.direct ? 2.75 : 2}
                opacity={edge.direct ? 1 : 0.6}
              />
            ) : null}
          </g>
        ))}
      </svg>

      {/* Field names on the focus's own links, as the site labels its ontology map. */}
      {edges.map((edge) =>
        edge.label ? (
          <span
            key={`label-${edge.id}`}
            aria-hidden
            className={`pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-panel px-1.5 py-px font-mono text-[10.5px] leading-4 text-accent ${
              edge.kind === "chaining"
                ? "border-dashed border-accent/60"
                : "border-accent"
            }`}
            style={{ left: edge.lx, top: edge.ly }}
          >
            {edge.label}
          </span>
        ) : null,
      )}

      {ring ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-[1]"
          style={{ left: ring.x, top: ring.y }}
        >
          <span
            className="tide-ripple absolute left-0 top-0 block rounded-full border-2 border-accent"
            style={{ width: ring.r * 2 + 10, height: ring.r * 2 + 10 }}
          />
          <span
            className="absolute left-0 top-0 block -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent"
            style={{ width: ring.r * 2 + 8, height: ring.r * 2 + 8 }}
          />
        </span>
      ) : null}

      {peek && hoveredId ? <HoverPeek id={hoveredId} at={peek} /> : null}
    </>
  );
}

/** A small card above the hovered node: what it is and how linked it is. */
function HoverPeek({ id, at }: { id: string; at: Point & { r: number } }) {
  const { summaries, corpus } = useCatalog();
  const summary = summaries.get(id);
  if (!summary) return null;
  let detection = 0;
  let chaining = 0;
  for (const edge of [...outEdges(corpus, id), ...inEdges(corpus, id)]) {
    if (edge.kind === "chaining") chaining += 1;
    else detection += 1;
  }
  const facts = [
    summary.schema ?? TYPE_LABELS[summary.type].toLowerCase(),
    detection ? `${detection} link${detection === 1 ? "" : "s"}` : null,
    chaining ? `${chaining} chained` : null,
    summary.techniques.length ? `${summary.techniques.length} ATT&CK` : null,
  ].filter(Boolean);

  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-30"
      style={{
        left: at.x,
        top: at.y - at.r - 12,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="tide-fade-slide w-max max-w-[18rem] rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-float backdrop-blur">
        <div className="flex items-start gap-2.5">
          <TypeIcon type={summary.type} size="sm" className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-snug text-ink">
              {summary.name}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] text-subtle">
              {facts.join(" · ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const BAND_TONES = ["0.07", "0.1", "0.13", "0.05"];

/** Kill chain stages as bands behind the threats grouped into them. */
export function KillchainBands({
  sigma,
  groups,
  palette,
}: {
  sigma: Sigma;
  groups: KillchainGroupLayout[];
  palette: GraphPalette;
}) {
  const [boxes, setBoxes] = useState<
    Array<{
      stage: string;
      x: number;
      y: number;
      w: number;
      h: number;
      count: number;
    }>
  >([]);

  useAfterRender(sigma, () => {
    if (!groups.length) {
      setBoxes((current) => (current.length ? [] : current));
      return;
    }
    setBoxes(
      groups.flatMap((group) => {
        const tl = sigma.graphToViewport({ x: group.minX, y: group.maxY });
        const br = sigma.graphToViewport({ x: group.maxX, y: group.minY });
        const w = br.x - tl.x;
        const h = br.y - tl.y;
        if (!Number.isFinite(w) || w < 8 || h < 8) return [];
        return [
          {
            stage: group.label,
            x: tl.x,
            y: tl.y,
            w,
            h,
            count: group.nodeIds.length,
          },
        ];
      }),
    );
  });

  if (!boxes.length) return null;
  return (
    <div
      aria-hidden
      className="graph-underlay pointer-events-none absolute inset-0"
    >
      {boxes.map((box, i) => (
        <div
          key={box.stage}
          className="absolute rounded-2xl border"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            borderColor: mix(palette.panel, palette.accent, 0.3),
            backgroundColor: `color-mix(in srgb, ${palette.accent} ${Number(BAND_TONES[i % BAND_TONES.length]) * 100}%, transparent)`,
          }}
        >
          <span className="absolute left-3 top-2 flex items-center gap-2 font-mono text-[11px] text-accent">
            {box.stage.toLowerCase()}
            <span className="text-subtle">{box.count}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
