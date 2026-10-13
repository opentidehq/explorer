"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useCatalog,
  useDisplayedIds,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { NoMatches } from "@/components/explorer/stage";
import { SectionLabel, Tag, TypeIcon } from "@/components/ui/tide";
import type { Catalog } from "@/lib/explorer/catalog";
import { getCausalChain } from "@/lib/graph/corpus-graph";
import { getThreatKillchain } from "@/lib/graph/killchain-grouping";
import {
  buildListViewModel,
  type ListViewModel,
} from "@/lib/graph/list-view-data";
import { TYPE_ICONS } from "@/lib/graph/type-icons";
import type { ObjectBody, ObjectType } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

type RowState = "normal" | "focus" | "related" | "dimmed";

interface RowProps {
  id: string;
  type: ObjectType;
  name: string;
  meta?: string | null;
  threats?: number;
  objectives?: number;
  rules?: number;
  /** A rule's deployment status. */
  status?: string;
  state: RowState;
  nested?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

// Primitive props only, so a hover re-renders just the rows whose state changed.
const Row = memo(function Row({
  id,
  type,
  name,
  meta,
  threats = 0,
  objectives = 0,
  rules = 0,
  status,
  state,
  nested,
  onSelect,
  onHover,
}: RowProps) {
  const counts = (
    [
      ["threat", threats],
      ["objective", objectives],
      ["rule", rules],
    ] as Array<[ObjectType, number]>
  ).filter(([, n]) => n > 0);
  return (
    <button
      type="button"
      data-row={id}
      onClick={() => onSelect(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      aria-pressed={state === "focus"}
      className={cn(
        "group flex w-full min-w-0 items-start gap-2.5 rounded-xl border text-left transition-[border-color,background-color,opacity,box-shadow] duration-200",
        nested ? "px-2 py-1.5" : "px-2.5 py-2",
        state === "focus"
          ? "border-accent bg-panel shadow-[0_8px_24px_-14px_var(--tide-btn-shadow)]"
          : state === "related"
            ? "border-accent/45 bg-panel"
            : "border-line bg-panel hover:border-ink/25",
        state === "dimmed" && "opacity-45 hover:opacity-100",
      )}
    >
      <TypeIcon
        type={type}
        size={nested ? "xs" : "sm"}
        active={state === "focus"}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 font-medium leading-snug text-ink",
            nested ? "text-[12px]" : "text-[13px]",
          )}
        >
          {name}
        </span>
        {meta || counts.length || status ? (
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            {status ? (
              <Tag
                tone={statusTone(status)}
                className="px-1.5 text-[10px] leading-[14px]"
              >
                {status.toLowerCase()}
              </Tag>
            ) : null}
            {meta ? (
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-subtle">
                {meta}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {counts.map(([t, n]) => {
              const Icon = TYPE_ICONS[t];
              return (
                <span
                  key={t}
                  title={`${n} ${t}${n === 1 ? "" : "s"}`}
                  className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-subtle"
                >
                  <Icon className="size-2.5" aria-hidden />
                  {n}
                </span>
              );
            })}
          </span>
        ) : null}
      </span>
    </button>
  );
});

function Column({
  n,
  label,
  count,
  aside,
  scrollRef,
  onScroll,
  children,
}: {
  n: number;
  label: string;
  count: number;
  aside?: ReactNode;
  scrollRef: (node: HTMLDivElement | null) => void;
  onScroll: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col" aria-label={label}>
      <div className="shrink-0 px-4 pt-4 pb-3">
        <SectionLabel n={n} aside={count}>
          {label}
        </SectionLabel>
        {aside ? (
          <p className="mt-1 pl-[2.6rem] font-mono text-[10.5px] text-subtle">
            {aside}
          </p>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        data-column
        onScroll={onScroll}
        className="tide-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-6"
      >
        {children}
      </div>
    </section>
  );
}

function techniquesMeta(techniques: string[]) {
  if (!techniques.length) return null;
  const shown = techniques.slice(0, 2).join(" · ");
  return techniques.length > 2 ? `${shown} +${techniques.length - 2}` : shown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectiveMeta(body: ObjectBody | undefined) {
  const objective = body?.["objective"] as ObjectBody | undefined;
  return [asString(objective?.["priority"]), asString(objective?.["type"])]
    .filter(Boolean)
    .join(" · ");
}

/** The furthest a rule has gone on any integration. */
function bestStatus(statuses: unknown[]): string | undefined {
  const values = statuses
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toUpperCase());
  if (values.includes("PRODUCTION")) return "PRODUCTION";
  if (values.includes("STAGING")) return "STAGING";
  return values[0];
}

function statusTone(status: string): "solid" | "accent" | "outline" {
  if (status === "PRODUCTION") return "solid";
  if (status === "STAGING") return "accent";
  return "outline";
}

interface Connector {
  key: string;
  d: string;
  active: boolean;
}

/**
 * The catalogue as the ontology reads it: threats, the objectives that cover them (with their
 * signals), and the rules that implement those. Threats with an objective come first; the rest
 * are the gaps. Hover or pick any object and its chain lights up across the columns.
 */
export function CatalogueView() {
  const catalog = useCatalog();
  const actions = useExplorerActions();
  const displayed = useDisplayedIds();
  const selectedId = useExplorer((s) => s.selectedId);
  const hoveredId = useExplorer((s) => s.hoveredId);

  const model = useMemo(
    () =>
      buildListViewModel(catalog.graph, catalog.bundle.summaries, displayed),
    [catalog, displayed],
  );

  const coverage = useMemo(() => coverageIndex(model), [model]);

  const selectedChain = useMemo(
    () =>
      selectedId ? getCausalChain(catalog.corpus, selectedId).nodes : null,
    [catalog.corpus, selectedId],
  );
  const focus = hoveredId ?? selectedId;
  const focusChain = useMemo(
    () =>
      hoveredId && hoveredId !== selectedId
        ? getCausalChain(catalog.corpus, hoveredId).nodes
        : selectedChain,
    [catalog.corpus, hoveredId, selectedId, selectedChain],
  );

  const stateOf = useCallback(
    (id: string): RowState => {
      if (!focus || !focusChain) return "normal";
      if (id === focus) return "focus";
      return focusChain.has(id) ? "related" : "dimmed";
    },
    [focus, focusChain],
  );

  // A selection brings its chain to the top of each column; hovering does not reorder.
  const rank = useCallback(
    (id: string) => (selectedChain?.has(id) ? 0 : 1),
    [selectedChain],
  );

  const threats = useMemo(() => {
    const covered = model.threats.filter((t) =>
      coverage.objectivesByThreat.has(t.id),
    );
    const gaps = model.threats.filter(
      (t) => !coverage.objectivesByThreat.has(t.id),
    );
    const order = <T extends { id: string }>(list: T[]) =>
      selectedChain ? list.toSorted((a, b) => rank(a.id) - rank(b.id)) : list;
    return { covered: order(covered), gaps: order(gaps) };
  }, [model.threats, coverage, selectedChain, rank]);

  const objectives = useMemo(
    () =>
      selectedChain
        ? model.objectives.toSorted((a, b) => {
            const ra = Math.min(rank(a.objective.id), ...a.signalIds.map(rank));
            const rb = Math.min(rank(b.objective.id), ...b.signalIds.map(rank));
            return ra - rb;
          })
        : model.objectives,
    [model.objectives, selectedChain, rank],
  );

  const rules = useMemo(
    () =>
      selectedChain
        ? model.rules.toSorted((a, b) => rank(a.id) - rank(b.id))
        : model.rules,
    [model.rules, selectedChain, rank],
  );

  const looseSignals = useMemo(
    () =>
      selectedChain
        ? model.looseSignals.toSorted((a, b) => rank(a.id) - rank(b.id))
        : model.looseSignals,
    [model.looseSignals, selectedChain, rank],
  );

  const select = useCallback(
    (id: string) => actions.select(id === selectedId ? null : id),
    [actions, selectedId],
  );

  // Columns return to the top when a selection reorders them.
  const columns = useRef<Array<HTMLDivElement | null>>([null, null, null]);
  useEffect(() => {
    if (!selectedId) return;
    for (const column of columns.current)
      column?.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedId]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !focus || !focusChain) {
      setConnectors((current) => (current.length ? [] : current));
      return;
    }
    const origin = stage.getBoundingClientRect();
    const rectOf = (id: string) => {
      const row = stage.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(id)}"]`,
      );
      const column = row?.closest<HTMLElement>("[data-column]");
      if (!row || !column) return null;
      const r = row.getBoundingClientRect();
      const c = column.getBoundingClientRect();
      // Rows scrolled out of their column draw nothing.
      if (r.bottom < c.top + 4 || r.top > c.bottom - 4) return null;
      return {
        left: r.left - origin.left,
        right: r.right - origin.left,
        y:
          Math.min(Math.max(r.top + r.height / 2, c.top + 8), c.bottom - 8) -
          origin.top,
      };
    };

    const next: Connector[] = [];
    for (const edge of catalog.corpus.edges) {
      if (edge.kind !== "detection") continue;
      if (!focusChain.has(edge.source) || !focusChain.has(edge.target))
        continue;
      const targetType = catalog.corpus.nodeById.get(edge.target)?.type;
      // Objective → signal is nesting, not a connector.
      if (targetType === "signal") continue;
      const a = rectOf(edge.source);
      const b = rectOf(edge.target);
      if (!a || !b || b.left <= a.right) continue;
      const x1 = a.right;
      const x2 = b.left;
      const bend = Math.max(24, (x2 - x1) * 0.5);
      next.push({
        key: edge.id,
        d: `M${x1},${a.y} C${x1 + bend},${a.y} ${x2 - bend},${b.y} ${x2},${b.y}`,
        active: edge.source === focus || edge.target === focus,
      });
    }
    setConnectors(next);
  }, [catalog.corpus, focus, focusChain]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    schedule();
    return () => cancelAnimationFrame(frame.current);
  }, [schedule, threats, objectives, looseSignals, rules]);

  // The stage is a new element after a search that matched nothing: observe that one.
  const empty = displayed.size === 0;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [schedule, empty]);

  if (empty) return <NoMatches />;

  const ruleBody = (id: string) => catalog.bundle.flatIndex[id];

  return (
    <div
      ref={stageRef}
      className="relative grid h-full min-h-0 grid-cols-1 divide-y divide-line overflow-y-auto md:grid-cols-3 md:divide-x md:divide-y-0 md:overflow-hidden"
      onMouseLeave={() => actions.hover(null)}
    >
      <div className="flex min-h-0 flex-col md:h-full">
        <Column
          n={1}
          label="threats"
          count={model.threats.length}
          aside={`${threats.covered.length} with an objective`}
          scrollRef={(node) => {
            columns.current[0] = node;
          }}
          onScroll={schedule}
        >
          {threats.covered.map((threat) => (
            <Row
              key={threat.id}
              id={threat.id}
              type="threat"
              name={threat.name}
              meta={threatMeta(catalog, threat.id)}
              objectives={coverage.objectivesByThreat.get(threat.id)?.size}
              rules={coverage.rulesByThreat.get(threat.id)?.size}
              state={stateOf(threat.id)}
              onSelect={select}
              onHover={actions.hover}
            />
          ))}
          {threats.gaps.length ? (
            <Divider>not yet covered · {threats.gaps.length}</Divider>
          ) : null}
          {threats.gaps.map((threat) => (
            <Row
              key={threat.id}
              id={threat.id}
              type="threat"
              name={threat.name}
              meta={threatMeta(catalog, threat.id)}
              state={stateOf(threat.id)}
              onSelect={select}
              onHover={actions.hover}
            />
          ))}
          {model.threats.length === 0 ? (
            <EmptyColumn>No threats in view.</EmptyColumn>
          ) : null}
        </Column>
      </div>

      <div className="flex min-h-0 flex-col md:h-full">
        <Column
          n={2}
          label="objectives"
          count={model.objectives.length}
          aside={`${model.objectives.reduce((n, row) => n + row.signalIds.length, 0)} signals inside`}
          scrollRef={(node) => {
            columns.current[1] = node;
          }}
          onScroll={schedule}
        >
          {objectives.map((row) => (
            <div key={row.objective.id} className="space-y-1">
              <Row
                id={row.objective.id}
                type="objective"
                name={row.objective.name}
                meta={
                  objectiveMeta(catalog.bundle.flatIndex[row.objective.id]) ||
                  null
                }
                threats={row.threatIds.length}
                rules={row.ruleIds.length}
                state={stateOf(row.objective.id)}
                onSelect={select}
                onHover={actions.hover}
              />
              {row.signalIds.length ? (
                <div className="ml-[18px] space-y-1 border-l border-line pl-3">
                  {row.signalIds.map((signalId) => {
                    const severity = asString(
                      catalog.bundle.flatIndex[signalId]?.["severity"],
                    );
                    return (
                      <Row
                        key={signalId}
                        id={signalId}
                        type="signal"
                        name={catalog.summaries.get(signalId)?.name ?? signalId}
                        meta={severity}
                        state={stateOf(signalId)}
                        nested
                        onSelect={select}
                        onHover={actions.hover}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
          {objectives.length === 0 && looseSignals.length === 0 ? (
            <EmptyColumn>No objectives in view.</EmptyColumn>
          ) : null}
          {looseSignals.length ? (
            <>
              <Divider>
                {objectives.length ? "other signals" : "signals"} ·{" "}
                {looseSignals.length}
              </Divider>
              {looseSignals.map((signal) => (
                <Row
                  key={signal.id}
                  id={signal.id}
                  type="signal"
                  name={signal.name}
                  meta={
                    signal.objectiveId
                      ? `in ${catalog.summaries.get(signal.objectiveId)?.name ?? signal.objectiveId}`
                      : null
                  }
                  state={stateOf(signal.id)}
                  nested
                  onSelect={select}
                  onHover={actions.hover}
                />
              ))}
            </>
          ) : null}
        </Column>
      </div>

      <div className="flex min-h-0 flex-col md:h-full">
        <Column
          n={3}
          label="rules"
          count={model.rules.length}
          scrollRef={(node) => {
            columns.current[2] = node;
          }}
          onScroll={schedule}
        >
          {rules.map((rule) => {
            const configurations =
              (ruleBody(rule.id)?.["configurations"] as
                | Record<string, ObjectBody>
                | undefined) ?? {};
            const platforms = Object.entries(configurations);
            return (
              <Row
                key={rule.id}
                id={rule.id}
                type="rule"
                name={rule.name}
                meta={
                  platforms
                    .map(([key]) => key.replace(/_/g, " "))
                    .join(" · ") || null
                }
                status={bestStatus(
                  platforms.map(([, config]) => config?.["status"]),
                )}
                state={stateOf(rule.id)}
                onSelect={select}
                onHover={actions.hover}
              />
            );
          })}
          {rules.length === 0 ? (
            <EmptyColumn>No rules in view.</EmptyColumn>
          ) : null}
        </Column>
      </div>

      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible md:block"
      >
        {connectors.map((connector) => (
          <g key={connector.key}>
            <path
              d={connector.d}
              pathLength={1}
              className="tide-draw"
              fill="none"
              stroke="var(--tide-accent)"
              strokeOpacity={connector.active ? 0.9 : 0.45}
              strokeWidth={connector.active ? 1.75 : 1.25}
            />
            {connector.active ? (
              <path
                d={connector.d}
                className="tide-flow"
                fill="none"
                stroke="var(--tide-accent)"
                strokeWidth={2.5}
              />
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** A dashed rule with a caption, between groups in a column. */
function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-4 pb-1.5 font-mono text-[11px] text-subtle">
      <span
        aria-hidden
        className="h-px flex-1 border-t border-dashed border-ink/20"
      />
      {children}
      <span
        aria-hidden
        className="h-px flex-1 border-t border-dashed border-ink/20"
      />
    </div>
  );
}

function EmptyColumn({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-ink/20 px-3 py-6 text-center text-xs text-subtle">
      {children}
    </p>
  );
}

function threatMeta(catalog: Catalog, id: string) {
  const summary = catalog.summaries.get(id);
  const stage = getThreatKillchain(catalog.bundle.flatIndex[id]);
  return [stage?.toLowerCase(), techniquesMeta(summary?.techniques ?? [])]
    .filter(Boolean)
    .join(" · ");
}

function coverageIndex(model: ListViewModel) {
  const objectivesByThreat = new Map<string, Set<string>>();
  const rulesByThreat = new Map<string, Set<string>>();
  for (const row of model.objectives) {
    for (const threatId of row.threatIds) {
      const objectives = objectivesByThreat.get(threatId) ?? new Set<string>();
      objectives.add(row.objective.id);
      objectivesByThreat.set(threatId, objectives);
      const rules = rulesByThreat.get(threatId) ?? new Set<string>();
      for (const ruleId of row.ruleIds) rules.add(ruleId);
      rulesByThreat.set(threatId, rules);
    }
  }
  return { objectivesByThreat, rulesByThreat };
}
