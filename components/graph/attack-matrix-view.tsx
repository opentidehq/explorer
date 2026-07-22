"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import {
  ArrowUpCircle,
  Binoculars,
  Building2,
  ChevronDown,
  CircleHelp,
  Cog,
  DoorOpen,
  EyeOff,
  Factory,
  FolderInput,
  Ghost,
  Grid3x3,
  KeyRound,
  MoveHorizontal,
  PackagePlus,
  Radio,
  Repeat,
  ScanSearch,
  ShieldOff,
  Smartphone,
  Terminal,
  Upload,
  Zap,
} from "lucide-react";
import { CoverageBadges } from "@/components/ui/coverage-badges";
import { ObjectHoverTooltip } from "@/components/ui/object-hover-tooltip";
import { extractObjectDescription } from "@/lib/opentide/object-description";
import { VocabTooltip } from "@/components/ui/vocab-tooltip";
import { useExplorer } from "@/components/shell/explorer-context";
import {
  ATTACK_MATRIX_KINDS,
  buildAttackMatrixModel,
  coverageCountsForTechnique,
  formatTacticLabel,
  getTacticIconSlug,
  isTechniqueCovered,
  techniquesForTactic,
  type AttackMatrixKind,
  type AttackTechniqueMapping,
} from "@/lib/graph/attack-mapping";
import { TYPE_ICONS, TYPE_TEXT_CLASS } from "@/lib/graph/type-icons";
import { cn } from "@/lib/utils";

const TACTIC_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  binoculars: Binoculars,
  "package-plus": PackagePlus,
  "door-open": DoorOpen,
  terminal: Terminal,
  repeat: Repeat,
  "arrow-up-circle": ArrowUpCircle,
  ghost: Ghost,
  "key-round": KeyRound,
  "scan-search": ScanSearch,
  "move-horizontal": MoveHorizontal,
  "folder-input": FolderInput,
  radio: Radio,
  upload: Upload,
  zap: Zap,
  "eye-off": EyeOff,
  "shield-off": ShieldOff,
  cog: Cog,
  "circle-help": CircleHelp,
};

const COLUMN_SCROLL_CLASS =
  "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const MATRIX_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const MATRIX_ICONS: Record<
  AttackMatrixKind,
  ComponentType<{ className?: string }>
> = {
  Enterprise: Building2,
  ICS: Factory,
  Mobile: Smartphone,
};

function TechniqueCell({
  technique,
  expanded,
  onToggleExpand,
  onSelectObject,
  selectedId,
  getObjectDescription,
}: {
  technique: AttackTechniqueMapping;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectObject: (id: string) => void;
  selectedId: string | null;
  getObjectDescription: (id: string) => string | null;
}) {
  const covered = isTechniqueCovered(technique);
  const coverage = useMemo(
    () => coverageCountsForTechnique(technique),
    [technique],
  );

  const techniqueHeader = (
    <div className="w-full min-w-0">
      <div className="flex min-w-0 items-start gap-1 px-2 pt-1.5">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-foreground/90">
            {technique.techniqueId}
          </span>
          <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
            {technique.name}
          </span>
        </div>
        {covered ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="explorer-interactive mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse mapped objects for ${technique.techniqueId}`
                : `Expand mapped objects for ${technique.techniqueId}`
            }
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded ? "rotate-180" : "",
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
      {covered ? (
        <div className="shrink-0 px-2 pb-1.5 pt-1">
          <CoverageBadges counts={coverage} variant="compact" />
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        "explorer-interactive flex w-full min-w-0 flex-col rounded-md border text-left",
        covered
          ? "explorer-attack-technique-covered"
          : "explorer-attack-technique-uncovered",
      )}
    >
      {technique.description?.trim() ? (
        <VocabTooltip
          label={`${technique.techniqueId} — ${technique.name}`}
          description={technique.description}
          side="right"
          align="start"
          collisionPadding={16}
        >
          <div className="w-full min-w-0">{techniqueHeader}</div>
        </VocabTooltip>
      ) : (
        techniqueHeader
      )}

      {covered && expanded ? (
        <div className="explorer-attack-expand min-w-0 border-t px-2 py-1.5">
          <ul className="min-w-0 space-y-1">
            {technique.objects.map((obj) => {
              const Icon = TYPE_ICONS[obj.role];
              const description = getObjectDescription(obj.id);
              return (
                <li key={obj.id} className="min-w-0">
                  <ObjectHoverTooltip
                    name={obj.name}
                    description={description}
                    side="right"
                    align="start"
                    collisionPadding={16}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectObject(obj.id)}
                      className={cn(
                        "explorer-interactive explorer-attack-object-btn flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left text-[10px]",
                        selectedId === obj.id && "ring-1 ring-primary/40",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-3 w-3 shrink-0",
                          TYPE_TEXT_CLASS[obj.role],
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 line-clamp-2 leading-snug text-foreground/90">
                        {obj.name}
                      </span>
                    </button>
                  </ObjectHoverTooltip>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MatrixToggle({
  value,
  onChange,
  className,
}: {
  value: AttackMatrixKind;
  onChange: (matrix: AttackMatrixKind) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto inline-flex rounded-full border border-border/30 bg-card/80 p-0.5 shadow-md backdrop-blur-sm",
        className,
      )}
      role="group"
      aria-label="ATT&CK matrix"
    >
      {ATTACK_MATRIX_KINDS.map((kind) => {
        const Icon = MATRIX_ICONS[kind];
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            className={cn(
              "explorer-interactive inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold",
              selected
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            aria-pressed={selected}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            {kind}
          </button>
        );
      })}
    </div>
  );
}

function FloatingMatrixToggle({
  value,
  onChange,
}: {
  value: AttackMatrixKind;
  onChange: (matrix: AttackMatrixKind) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-50 flex justify-center">
      <MatrixToggle value={value} onChange={onChange} />
    </div>
  );
}

export function AttackMatrixView() {
  const {
    bundle,
    graphContext,
    visibleIds,
    vocabIndex,
    selectedId,
    setSelectedId,
  } = useExplorer();

  const [matrix, setMatrix] = useState<AttackMatrixKind>("Enterprise");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const getObjectDescription = useCallback(
    (id: string) => extractObjectDescription(bundle.flatIndex[id]),
    [bundle.flatIndex],
  );

  const model = useMemo(
    () =>
      buildAttackMatrixModel(
        graphContext,
        bundle.summaries,
        visibleIds,
        vocabIndex,
        matrix,
      ),
    [graphContext, bundle.summaries, visibleIds, vocabIndex, matrix],
  );

  const toggleExpanded = (techniqueId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(techniqueId)) next.delete(techniqueId);
      else next.add(techniqueId);
      return next;
    });
  };

  if (visibleIds.size === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Grid3x3 className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="text-lg font-medium">No objects match your search</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Broaden your filters to populate the ATT&CK coverage matrix.
        </p>
      </div>
    );
  }

  if (model.techniques.length === 0) {
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Grid3x3 className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="text-lg font-medium">
            No {matrix} techniques in vocabulary
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Switch matrices or update the ATT&CK vocabulary bundle.
          </p>
        </div>
        <FloatingMatrixToggle value={matrix} onChange={setMatrix} />
      </div>
    );
  }

  return (
    <div className="explorer-attack-view relative flex h-full min-h-0 flex-col">
      <div className={MATRIX_SCROLL_CLASS}>
        <div
          className="flex h-full min-h-[320px] gap-2"
          style={{ minWidth: `${model.tactics.length * 168}px` }}
        >
          {model.tactics.map((tactic) => {
            const cells = techniquesForTactic(model, tactic);
            const iconSlug = getTacticIconSlug(tactic);
            const TacticIcon = TACTIC_ICONS[iconSlug] ?? CircleHelp;
            return (
              <div
                key={tactic}
                className="explorer-attack-column flex h-full w-[168px] shrink-0 flex-col rounded-lg border"
              >
                <header className="explorer-attack-column-header shrink-0 border-b px-2 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <TacticIcon
                      className="h-3.5 w-3.5 shrink-0 text-foreground"
                      aria-hidden
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">
                      {formatTacticLabel(tactic)}
                    </span>
                  </div>
                </header>
                <div className={COLUMN_SCROLL_CLASS}>
                  {cells.map((technique) => (
                    <TechniqueCell
                      key={`${tactic}-${technique.techniqueId}`}
                      technique={technique}
                      expanded={expandedIds.has(technique.techniqueId)}
                      onToggleExpand={() =>
                        toggleExpanded(technique.techniqueId)
                      }
                      onSelectObject={setSelectedId}
                      selectedId={selectedId}
                      getObjectDescription={getObjectDescription}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <FloatingMatrixToggle value={matrix} onChange={setMatrix} />
    </div>
  );
}
