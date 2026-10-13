"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { ArrowUpRight, Filter } from "lucide-react";
import {
  useCatalog,
  useDisplayedIds,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { NoMatches } from "@/components/explorer/stage";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Caption, Segmented, TypeIcon } from "@/components/ui/tide";
import { techniqueUrl } from "@/lib/explorer/catalog";
import {
  ATTACK_MATRIX_KINDS,
  buildAttackMatrixModel,
  formatTacticLabel,
  resolveObjectTechniques,
  type AttackMatrixKind,
  type AttackTechniqueMapping,
} from "@/lib/graph/attack-mapping";
import { hasClause } from "@/lib/search/filters";
import { cn } from "@/lib/utils";

type Coverage = "detected" | "gap" | "none";

function coverageOf(technique: AttackTechniqueMapping): {
  level: Coverage;
  detections: number;
} {
  let detections = 0;
  for (const object of technique.objects)
    if (object.role !== "threat") detections += 1;
  if (detections > 0) return { level: "detected", detections };
  return { level: technique.objects.length ? "gap" : "none", detections: 0 };
}

/** Heat steps for detection-backed techniques, after the site's heatmap (25 / 55 / 90%). */
function heat(detections: number) {
  if (detections >= 3)
    return {
      bg: "color-mix(in srgb, var(--tide-accent) 88%, transparent)",
      strong: true,
    };
  if (detections === 2)
    return {
      bg: "color-mix(in srgb, var(--tide-accent) 52%, transparent)",
      strong: true,
    };
  return {
    bg: "color-mix(in srgb, var(--tide-accent) 22%, transparent)",
    strong: false,
  };
}

const Cell = memo(function Cell({
  technique,
  open,
  marked,
  onToggle,
}: {
  technique: AttackTechniqueMapping;
  open: boolean;
  /** One of the selected object's techniques. */
  marked: boolean;
  onToggle: (id: string) => void;
}) {
  const { level, detections } = coverageOf(technique);
  const fill = level === "detected" ? heat(detections) : null;
  const sub = technique.techniqueId.includes(".");

  const tile = (
    <button
      type="button"
      onClick={() => onToggle(technique.techniqueId)}
      aria-expanded={technique.objects.length ? open : undefined}
      className={cn(
        "relative block w-full rounded-lg border px-2 py-1.5 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px",
        sub && "ml-2 w-[calc(100%-0.5rem)]",
        level === "gap" && "border-dashed border-accent/55 bg-accent/5",
        level === "none" &&
          "border-transparent bg-ink/[0.035] hover:border-line",
        level === "detected" && "border-transparent",
        marked && "ring-2 ring-accent ring-offset-1 ring-offset-panel",
      )}
      style={fill ? { backgroundColor: fill.bg } : undefined}
    >
      <span
        className={cn(
          "block font-mono text-[10px] leading-4",
          fill?.strong
            ? "text-accent-fg/80"
            : level === "none"
              ? "text-dim"
              : "text-subtle",
        )}
      >
        {technique.techniqueId}
        {technique.objects.length ? (
          <span className="float-right">{technique.objects.length}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[11.5px] leading-snug",
          fill?.strong
            ? "font-medium text-accent-fg"
            : level === "none"
              ? "text-subtle"
              : "font-medium text-ink",
        )}
      >
        {technique.name}
      </span>
    </button>
  );

  return (
    <li>
      {technique.description ? (
        <Tooltip delayDuration={450}>
          <TooltipTrigger asChild>{tile}</TooltipTrigger>
          <TooltipContent side="right" align="start" className="max-w-80">
            <p className="font-mono text-[10.5px] text-subtle">
              {technique.techniqueId}
            </p>
            <p className="font-semibold">{technique.name}</p>
            <p className="mt-1 text-muted">{technique.description}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        tile
      )}
      {open && technique.objects.length ? (
        <CellObjects technique={technique} />
      ) : null}
    </li>
  );
});

function CellObjects({ technique }: { technique: AttackTechniqueMapping }) {
  const actions = useExplorerActions();
  const query = useExplorer((s) => s.query);
  const filtered = hasClause(query, "technique", technique.techniqueId);
  const ordered = technique.objects.toSorted(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
  );
  return (
    <div className="tide-fade-slide mt-1 rounded-lg border border-line bg-panel p-1.5 shadow-float">
      <ul className="space-y-0.5">
        {ordered.map((object) => (
          <li key={object.id}>
            <button
              type="button"
              onClick={() => actions.select(object.id)}
              className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-hover"
            >
              <TypeIcon type={object.role} size="xs" className="mt-px" />
              <span className="line-clamp-2 text-[11.5px] leading-snug text-ink">
                {object.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between gap-1 border-t border-line px-1 pt-1.5">
        <button
          type="button"
          onClick={() =>
            actions.toggleToken("technique", technique.techniqueId)
          }
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-accent transition-colors hover:bg-accent/10"
        >
          <Filter className="size-3" aria-hidden />
          {filtered ? "clear filter" : "filter"}
        </button>
        <a
          href={techniqueUrl(technique.techniqueId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-subtle transition-colors hover:text-ink"
        >
          mitre
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}

const ROLE_ORDER = { threat: 0, objective: 1, signal: 2, rule: 3 } as const;

/**
 * ATT&CK as the library covers it: every technique of the matrix, filled by how many
 * objectives, signals and rules detect it; techniques only threats name are the gaps.
 */
export function AttackView() {
  const catalog = useCatalog();
  const displayed = useDisplayedIds();
  const selectedId = useExplorer((s) => s.selectedId);
  const [matrix, setMatrix] = useState<AttackMatrixKind>("Enterprise");
  const [mappedOnly, setMappedOnly] = useState<"all" | "mapped">("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const model = useMemo(
    () =>
      buildAttackMatrixModel(
        catalog.graph,
        catalog.bundle.summaries,
        displayed,
        catalog.vocab,
        matrix,
      ),
    [catalog, displayed, matrix],
  );

  const columns = useMemo(() => {
    const byTactic = new Map<string, AttackTechniqueMapping[]>();
    for (const tactic of model.tactics) byTactic.set(tactic, []);
    for (const technique of model.techniques) {
      if (mappedOnly === "mapped" && !technique.objects.length) continue;
      byTactic.get(technique.tactic)?.push(technique);
    }
    return model.tactics
      .map((tactic) => ({ tactic, techniques: byTactic.get(tactic) ?? [] }))
      .filter((column) => mappedOnly === "all" || column.techniques.length);
  }, [model, mappedOnly]);

  const stats = useMemo(() => {
    let mapped = 0;
    let detected = 0;
    let gaps = 0;
    for (const technique of model.techniqueById.values()) {
      const { level } = coverageOf(technique);
      if (level !== "none") mapped += 1;
      if (level === "detected") detected += 1;
      if (level === "gap") gaps += 1;
    }
    return { mapped, detected, gaps, total: model.techniqueById.size };
  }, [model]);

  const marked = useMemo(() => {
    const summary = selectedId ? catalog.summaries.get(selectedId) : undefined;
    if (!summary) return new Set<string>();
    return new Set(
      resolveObjectTechniques(catalog.graph, summary).map((t) =>
        t.toUpperCase(),
      ),
    );
  }, [catalog, selectedId]);

  const toggle = useCallback(
    (id: string) =>
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  if (displayed.size === 0) return <NoMatches />;

  const share = stats.mapped
    ? Math.round((stats.detected / stats.mapped) * 100)
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line px-5 pt-4 pb-4">
        <div className="flex items-end gap-6">
          <div>
            <Caption>att&amp;ck coverage · {model.versionLabel}</Caption>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-[-0.03em] text-ink">
                {share}%
              </span>
              <span className="text-sm text-muted">
                of the techniques in the library are detected by an objective or
                a rule
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 font-mono text-[11px] text-subtle">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-[3px] bg-accent/85" />
              detected · {stats.detected}
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-[3px] border border-dashed border-accent/60 bg-accent/5"
              />
              threats only · {stats.gaps}
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-[3px] bg-ink/[0.06]"
              />
              not in the library · {stats.total - stats.mapped}
            </li>
          </ul>
          <Segmented
            size="sm"
            role="group"
            label="Techniques shown"
            value={mappedOnly}
            onChange={setMappedOnly}
            options={[
              { value: "all", label: "all" },
              { value: "mapped", label: "in library" },
            ]}
          />
          <Segmented
            size="sm"
            role="group"
            label="ATT&CK matrix"
            value={matrix}
            onChange={setMatrix}
            options={ATTACK_MATRIX_KINDS.map((kind) => ({
              value: kind,
              label: kind.toLowerCase(),
            }))}
          />
        </div>
      </div>

      {columns.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-sm text-sm text-muted">
            No {matrix} techniques{" "}
            {mappedOnly === "mapped" ? "are in view" : "are in the vocabulary"}.
            Switch matrices or widen the search.
          </p>
        </div>
      ) : (
        <div className="tide-scroll min-h-0 flex-1 overflow-auto">
          <div
            className="flex min-h-full gap-2 px-4 pb-6"
            style={{ width: "max-content" }}
          >
            {columns.map(({ tactic, techniques }) => {
              const covered = techniques.filter(
                (t) => coverageOf(t).level === "detected",
              ).length;
              return (
                <section
                  key={tactic}
                  className="w-[164px] shrink-0"
                  aria-label={formatTacticLabel(tactic)}
                >
                  <header className="sticky top-0 z-10 -mx-1 bg-panel/95 px-1 pt-4 pb-2.5 backdrop-blur">
                    <p className="text-[12.5px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                      {formatTacticLabel(tactic)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-subtle">
                      {covered}/{techniques.length} detected
                    </p>
                    <span
                      aria-hidden
                      className="mt-2 block h-0.5 overflow-hidden rounded-full bg-ink/8"
                    >
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{
                          width: `${techniques.length ? (covered / techniques.length) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </header>
                  <ul className="space-y-1">
                    {techniques.map((technique) => (
                      <Cell
                        key={technique.techniqueId}
                        technique={technique}
                        open={open.has(technique.techniqueId)}
                        marked={marked.has(technique.techniqueId)}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
