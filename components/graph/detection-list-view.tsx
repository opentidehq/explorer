"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, List } from "lucide-react";
import { CoverageBadges } from "@/components/ui/coverage-badges";
import {
  extractObjectDescription,
  ObjectHoverTooltip,
} from "@/components/ui/object-hover-tooltip";
import { useExplorer } from "@/components/shell/explorer-context";
import { getCausalChain } from "@/lib/graph/corpus-graph";
import {
  applyListViewFocus,
  buildListViewModel,
  coverageForObjective,
  coverageForRule,
  coverageForThreat,
  getRelatedIdsForPreview,
  type CoverageCounts,
} from "@/lib/graph/list-view-data";
import { TYPE_ICONS, TYPE_TEXT_CLASS } from "@/lib/graph/type-icons";
import type { ObjectType } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

const COLUMN_SCROLL_CLASS =
  "explorer-list-column-scroll min-h-0 flex-1 overflow-y-auto bg-background p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const LIST_ROW_SELECTED_CLASS: Record<ObjectType, string> = {
  threat: "list-row-selected-threat",
  objective: "list-row-selected-objective",
  signal: "list-row-selected-signal",
  rule: "list-row-selected-rule",
};

function ListItemButton({
  id,
  name,
  description,
  type,
  selected,
  clickMuted,
  hoverPreviewId,
  previewIds,
  coverage,
  onSelect,
  nested,
}: {
  id: string;
  name: string;
  description?: string | null;
  type: ObjectType;
  selected: boolean;
  clickMuted: boolean;
  hoverPreviewId: string | null;
  previewIds: Set<string> | null;
  coverage: CoverageCounts;
  onSelect: (id: string) => void;
  nested?: boolean;
}) {
  const Icon = TYPE_ICONS[type];
  const isHovering = hoverPreviewId != null;
  const previewRelated = previewIds?.has(id) ?? false;
  const isHoverTarget = hoverPreviewId === id;
  const hoverDimmed = isHovering && !previewRelated && !selected;
  const visuallyMuted =
    clickMuted && !(isHovering && previewRelated) && !selected;
  const fadeContent =
    !selected && (hoverDimmed || (visuallyMuted && !previewRelated));

  return (
    <ObjectHoverTooltip
      name={name}
      description={description}
      side="right"
      align="start"
      collisionPadding={16}
    >
      <button
        type="button"
        data-list-item={id}
        onClick={() => onSelect(id)}
        className={cn(
          "explorer-interactive flex w-full min-w-0 items-center gap-2 rounded-md border py-2 pr-2 pl-2.5 text-left text-xs",
          nested && "py-1.5",
          selected
            ? LIST_ROW_SELECTED_CLASS[type]
            : hoverDimmed
              ? "list-row-dimmed"
              : visuallyMuted
                ? "list-row-muted"
                : isHoverTarget
                  ? "list-row-hover-target"
                  : previewRelated && isHovering
                    ? "list-row-preview"
                    : "list-row-default",
          visuallyMuted && !hoverDimmed && !selected && "text-muted-foreground",
        )}
      >
        <Icon
          className={cn(
            "explorer-interactive h-3.5 w-3.5 shrink-0",
            fadeContent
              ? "text-muted-foreground opacity-50"
              : TYPE_TEXT_CLASS[type],
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            fadeContent && "opacity-50",
          )}
        >
          {name}
        </span>
        <CoverageBadges counts={coverage} />
      </button>
    </ObjectHoverTooltip>
  );
}

function ObjectiveColumnRow({
  objectiveId,
  objectiveName,
  objectiveDescription,
  signalIds,
  signalNames,
  signalDescriptions,
  selectedId,
  focusIds,
  hoverPreviewId,
  previewIds,
  coverage,
  onSelect,
  onHover,
}: {
  objectiveId: string;
  objectiveName: string;
  objectiveDescription?: string | null;
  signalIds: string[];
  signalNames: Map<string, string>;
  signalDescriptions: Map<string, string | null>;
  selectedId: string | null;
  focusIds: Set<string> | null;
  hoverPreviewId: string | null;
  previewIds: Set<string> | null;
  coverage: CoverageCounts;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(signalIds.length > 0);
  const childSignalSelected =
    selectedId != null && signalIds.includes(selectedId);
  const objectiveClickMuted =
    focusIds != null && !focusIds.has(objectiveId) && selectedId != null;

  return (
    <div className="min-w-0 space-y-1">
      <div
        className="min-w-0"
        onMouseEnter={() => onHover(objectiveId)}
        onMouseLeave={() => onHover(null)}
      >
        <ListItemButton
          id={objectiveId}
          name={objectiveName}
          description={objectiveDescription}
          type="objective"
          selected={selectedId === objectiveId || childSignalSelected}
          clickMuted={objectiveClickMuted}
          hoverPreviewId={hoverPreviewId}
          previewIds={previewIds}
          coverage={coverage}
          onSelect={onSelect}
        />
      </div>
      {signalIds.length > 0 ? (
        <div className="min-w-0 pl-3">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="explorer-interactive mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden />
            )}
            Signals ({signalIds.length})
          </button>
          {expanded ? (
            <div className="space-y-1">
              {signalIds.map((signalId) => {
                const signalClickMuted =
                  focusIds != null &&
                  !focusIds.has(signalId) &&
                  selectedId != null;
                return (
                  <div
                    key={signalId}
                    className="min-w-0"
                    onMouseEnter={() => onHover(signalId)}
                    onMouseLeave={() => onHover(null)}
                  >
                    <ListItemButton
                      id={signalId}
                      name={signalNames.get(signalId) ?? signalId}
                      description={signalDescriptions.get(signalId)}
                      type="signal"
                      selected={selectedId === signalId}
                      clickMuted={signalClickMuted}
                      hoverPreviewId={hoverPreviewId}
                      previewIds={previewIds}
                      coverage={{}}
                      onSelect={onSelect}
                      nested
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DetectionListView() {
  const {
    bundle,
    graphContext,
    corpusGraph,
    visibleIds,
    selectedId,
    setSelectedId,
    getSummary,
  } = useExplorer();

  const [hoverPreviewId, setHoverPreviewId] = useState<string | null>(null);

  const getDescription = useCallback(
    (id: string) => extractObjectDescription(bundle.flatIndex[id]),
    [bundle.flatIndex],
  );

  const model = useMemo(
    () => buildListViewModel(graphContext, bundle.summaries, visibleIds),
    [graphContext, bundle.summaries, visibleIds],
  );

  const focusIds = useMemo(() => {
    if (!selectedId) return null;
    return getCausalChain(corpusGraph, selectedId).nodes;
  }, [corpusGraph, selectedId]);

  const previewIds = useMemo(() => {
    if (!hoverPreviewId) return null;
    return getRelatedIdsForPreview(corpusGraph, hoverPreviewId);
  }, [corpusGraph, hoverPreviewId]);

  const displayModel = useMemo(() => {
    return applyListViewFocus(model, focusIds);
  }, [model, focusIds]);

  const signalNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of displayModel.objectives) {
      for (const signalId of row.signalIds) {
        map.set(signalId, getSummary(signalId)?.name ?? signalId);
      }
    }
    return map;
  }, [displayModel.objectives, getSummary]);

  const signalDescriptions = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const row of displayModel.objectives) {
      for (const signalId of row.signalIds) {
        map.set(signalId, getDescription(signalId));
      }
    }
    return map;
  }, [displayModel.objectives, getDescription]);

  const handleSelect = useCallback(
    (id: string) => {
      const inFocus = !focusIds || focusIds.has(id);
      if (selectedId === id) {
        setSelectedId(null);
        return;
      }
      if (selectedId && !inFocus) {
        setSelectedId(null);
        return;
      }
      setSelectedId(id);
    },
    [focusIds, selectedId, setSelectedId],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSelectedId]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
  }, [setSelectedId]);

  if (visibleIds.size === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <List className="h-10 w-10 text-muted-foreground/50" aria-hidden />
        <p className="text-lg font-medium">No objects match your search</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Broaden your filters to see threat → objective → rule paths.
        </p>
      </div>
    );
  }

  return (
    <div
      className="explorer-list-view relative h-full w-full overflow-hidden bg-background"
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
      onMouseLeave={() => setHoverPreviewId(null)}
    >
      <div className="grid h-full min-h-0 grid-cols-3 divide-x divide-border/20 bg-background">
        <section className="explorer-list-column flex min-h-0 flex-col bg-background">
          <div
            className={cn(COLUMN_SCROLL_CLASS, "space-y-1.5")}
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            {displayModel.threats.map((threat) => {
              const clickMuted =
                focusIds != null &&
                !focusIds.has(threat.id) &&
                selectedId != null;
              return (
                <div
                  key={threat.id}
                  onMouseEnter={() => setHoverPreviewId(threat.id)}
                  onMouseLeave={() => setHoverPreviewId(null)}
                >
                  <ListItemButton
                    id={threat.id}
                    name={threat.name}
                    description={getDescription(threat.id)}
                    type="threat"
                    selected={selectedId === threat.id}
                    clickMuted={clickMuted}
                    hoverPreviewId={hoverPreviewId}
                    previewIds={previewIds}
                    coverage={coverageForThreat(threat.id, model)}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
            {displayModel.threats.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No visible threats
              </p>
            ) : null}
          </div>
        </section>

        <section className="explorer-list-column flex min-h-0 flex-col bg-background">
          <div
            className={cn(COLUMN_SCROLL_CLASS, "space-y-2")}
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            {displayModel.objectives.map((row) => (
              <ObjectiveColumnRow
                key={row.objective.id}
                objectiveId={row.objective.id}
                objectiveName={row.objective.name}
                objectiveDescription={getDescription(row.objective.id)}
                signalIds={row.signalIds}
                signalNames={signalNames}
                signalDescriptions={signalDescriptions}
                selectedId={selectedId}
                focusIds={focusIds}
                hoverPreviewId={hoverPreviewId}
                previewIds={previewIds}
                coverage={coverageForObjective(row)}
                onSelect={handleSelect}
                onHover={setHoverPreviewId}
              />
            ))}
            {displayModel.objectives.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No visible objectives
              </p>
            ) : null}
          </div>
        </section>

        <section className="explorer-list-column flex min-h-0 flex-col bg-background">
          <div
            className={cn(COLUMN_SCROLL_CLASS, "space-y-1.5")}
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            {displayModel.rules.map((rule) => {
              const clickMuted =
                focusIds != null &&
                !focusIds.has(rule.id) &&
                selectedId != null;
              return (
                <div
                  key={rule.id}
                  onMouseEnter={() => setHoverPreviewId(rule.id)}
                  onMouseLeave={() => setHoverPreviewId(null)}
                >
                  <ListItemButton
                    id={rule.id}
                    name={rule.name}
                    description={getDescription(rule.id)}
                    type="rule"
                    selected={selectedId === rule.id}
                    clickMuted={clickMuted}
                    hoverPreviewId={hoverPreviewId}
                    previewIds={previewIds}
                    coverage={coverageForRule(rule.id, model)}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
            {displayModel.rules.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No visible rules
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
