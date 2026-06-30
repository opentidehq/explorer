"use client";

import { useMemo } from "react";
import { GitBranch } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VocabTooltip } from "@/components/ui/vocab-tooltip";
import { useExplorer } from "@/components/shell/explorer-context";
import {
  TYPE_BG_CLASS,
  TYPE_BORDER_CLASS,
  TYPE_ICONS,
  TYPE_TEXT_CLASS,
} from "@/lib/graph/type-icons";
import {
  buildThreatChainTree,
  countThreatChainNodes,
  type ThreatChainEdge,
  type ThreatChainNode,
} from "@/lib/graph/threat-chain";
import { lookupChainingRelation, type VocabIndex } from "@/lib/opentide/vocab";
import type { BundleObjectSummary } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

export function ThreatChainModal({
  summary,
  open,
  onOpenChange,
}: {
  summary: BundleObjectSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { graphContext, getSummary, setSelectedId, vocabIndex } = useExplorer();

  const chainTree = useMemo(() => {
    if (!open || summary.type !== "threat") return null;
    return buildThreatChainTree(graphContext, summary.uuid);
  }, [graphContext, open, summary.type, summary.uuid]);

  const nodeCount = chainTree ? countThreatChainNodes(chainTree) : 0;

  const selectThreat = (id: string) => {
    setSelectedId(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
        <div className="shrink-0 border-b border-border/20 px-5 py-3 pr-12">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" aria-hidden />
            Threat chain
          </h2>
          <p className="mt-0.5 truncate text-sm font-medium">{summary.name}</p>
          {nodeCount > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {nodeCount} linked threat{nodeCount === 1 ? "" : "s"} in resolved
              chain
            </p>
          ) : null}
        </div>
        <ScrollArea className="h-[calc(85vh-6rem)] max-h-[calc(85vh-6rem)]">
          <div className="p-4">
            {open && chainTree ? (
              <ThreatChainBranch
                node={chainTree}
                depth={0}
                vocab={vocabIndex}
                getSummary={getSummary}
                onSelect={selectThreat}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No threat chaining defined for this object.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ThreatChainBranch({
  node,
  depth,
  vocab,
  getSummary,
  onSelect,
}: {
  node: ThreatChainNode;
  depth: number;
  vocab: VocabIndex;
  getSummary: (uuid: string) => BundleObjectSummary | undefined;
  onSelect: (id: string) => void;
}) {
  const summary = getSummary(node.id);
  const Icon = TYPE_ICONS.threat;

  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border/30 pl-4")}>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm border px-3 py-2 text-left transition-colors hover:bg-muted/40",
          node.isRoot
            ? "border-primary/35 bg-primary/10"
            : "border-border/30 bg-muted/10",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center border",
            TYPE_BORDER_CLASS.threat,
            TYPE_BG_CLASS.threat,
            TYPE_TEXT_CLASS.threat,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {summary?.name ?? node.id}
          </span>
          {node.isRoot ? (
            <span className="text-[10px] uppercase tracking-wider text-primary">
              Root threat
            </span>
          ) : node.isReference ? (
            <span className="text-[10px] text-muted-foreground">
              See above in chain
            </span>
          ) : null}
        </span>
      </button>

      {node.outgoing.length > 0 ? (
        <ul className="mt-2 space-y-3">
          {node.outgoing.map((edge) => (
            <li key={`${node.id}-${edge.relation}-${edge.target.id}`}>
              <ChainEdgeRow edge={edge} vocab={vocab} />
              {!edge.target.isReference ? (
                <div className="mt-2">
                  <ThreatChainBranch
                    node={edge.target}
                    depth={depth + 1}
                    vocab={vocab}
                    getSummary={getSummary}
                    onSelect={onSelect}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(edge.target.id)}
                  className="ml-4 mt-2 text-xs text-primary hover:underline"
                >
                  Jump to {getSummary(edge.target.id)?.name ?? edge.target.id}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChainEdgeRow({
  edge,
  vocab,
}: {
  edge: ThreatChainEdge;
  vocab: VocabIndex;
}) {
  const term = lookupChainingRelation(vocab, edge.relation);

  return (
    <div className="space-y-1.5">
      <VocabTooltip
        label={term?.name ?? edge.relation}
        description={term?.description}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary">
          <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
          {edge.relation}
        </span>
      </VocabTooltip>
      {edge.description ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {edge.description}
        </p>
      ) : null}
    </div>
  );
}
