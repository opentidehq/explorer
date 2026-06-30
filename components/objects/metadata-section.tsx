"use client";

import { useMemo } from "react";
import { ArrowDownLeft, Fingerprint, Link2 } from "lucide-react";
import { PanelSectionHeader } from "@/components/objects/panel-section-header";
import { FieldRow } from "@/components/objects/field-value-renderer";
import { useExplorer } from "@/components/shell/explorer-context";
import { TYPE_ICONS, typeIconBadgeClass } from "@/lib/graph/type-icons";
import {
  getMetadataFields,
  type MetadataFieldEntry,
} from "@/lib/opentide/metadata-fields";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";
import type { VocabIndex } from "@/lib/opentide/vocab";
import { cn } from "@/lib/utils";

export function MetadataSection({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const { graphContext, bundle, getSummary, setSelectedId, vocabIndex } =
    useExplorer();

  const { entries, parentObjective } = useMemo(
    () =>
      getMetadataFields(summary, body, {
        graphContext,
        flatIndex: bundle.flatIndex,
        getSummary,
      }),
    [summary, body, graphContext, bundle.flatIndex, getSummary],
  );

  if (!entries.length && !parentObjective) {
    return (
      <section aria-label="Metadata">
        <PanelSectionHeader icon={Fingerprint}>Metadata</PanelSectionHeader>
        <p className="text-sm text-muted-foreground">No metadata fields.</p>
      </section>
    );
  }

  return (
    <section aria-label="Metadata">
      <PanelSectionHeader icon={Fingerprint}>Metadata</PanelSectionHeader>

      {parentObjective ? (
        <ParentObjectiveLink
          parent={parentObjective}
          onSelect={setSelectedId}
        />
      ) : null}

      <dl className="space-y-4">
        {entries.map((entry) => (
          <MetadataFieldRow
            key={entry.field.path}
            entry={entry}
            vocab={vocabIndex}
          />
        ))}
      </dl>
    </section>
  );
}

function ParentObjectiveLink({
  parent,
  onSelect,
}: {
  parent: { id: string; name: string };
  onSelect: (id: string) => void;
}) {
  const ObjectiveIcon = TYPE_ICONS.objective;

  return (
    <div className="mb-4 rounded-md border border-border/40 bg-muted/15 px-3 py-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Parent objective
      </p>
      <button
        type="button"
        onClick={() => onSelect(parent.id)}
        className="flex w-full items-center gap-2 rounded-sm text-left transition-colors hover:bg-muted/30"
      >
        <span className={typeIconBadgeClass("objective", "sm")}>
          <ObjectiveIcon className="h-3 w-3" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {parent.name}
        </span>
        <Link2
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
    </div>
  );
}

function MetadataFieldRow({
  entry,
  vocab,
}: {
  entry: MetadataFieldEntry;
  vocab: VocabIndex;
}) {
  const { field, value, inherited, inheritedFrom } = entry;

  return (
    <div
      className={cn(
        inherited &&
          "rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2",
      )}
    >
      {inherited ? <InheritedBadge source={inheritedFrom} /> : null}
      <FieldRow field={field} value={value} vocab={vocab} />
    </div>
  );
}

function InheritedBadge({ source }: { source?: string }) {
  return (
    <p className="mb-2 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-primary/80">
      <ArrowDownLeft className="h-3 w-3 shrink-0" aria-hidden />
      Inherited{source ? ` from ${source}` : ""}
    </p>
  );
}
