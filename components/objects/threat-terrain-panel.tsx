"use client";

import { Globe } from "lucide-react";
import { FieldRow } from "@/components/objects/field-value-renderer";
import { PanelSectionHeader } from "@/components/objects/panel-section-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExplorer } from "@/components/shell/explorer-context";
import {
  FIELD_REGISTRY,
  type FieldDefinition,
} from "@/lib/opentide/field-registry";

const SURFACE_FIELD: FieldDefinition = FIELD_REGISTRY.threat.find(
  (field) => field.path === "threat.surface",
) ?? {
  path: "threat.surface",
  label: "Surface",
  format: "surface",
  vocab: "surface",
};

const TERRAIN_NARRATIVE_FIELD: FieldDefinition = {
  path: "threat.terrain",
  label: "Terrain description",
  format: "markdown",
};

export function ThreatTerrainPanel({
  surface,
  terrain,
}: {
  surface?: unknown;
  terrain?: unknown;
}) {
  const { vocabIndex } = useExplorer();
  const hasSurface = Array.isArray(surface) && surface.length > 0;
  const terrainText =
    typeof terrain === "string" && terrain.trim() ? terrain : null;

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Threat surface">
      <div className="shrink-0 border-b border-border/20 px-3 py-1.5">
        <PanelSectionHeader icon={Globe} className="mb-0">
          Surface
        </PanelSectionHeader>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 py-3">
          {hasSurface ? (
            <FieldRow
              field={SURFACE_FIELD}
              value={surface}
              vocab={vocabIndex}
            />
          ) : terrainText ? (
            <FieldRow
              field={SURFACE_FIELD}
              value={terrainText}
              vocab={vocabIndex}
            />
          ) : null}
          {hasSurface && terrainText ? (
            <FieldRow
              field={TERRAIN_NARRATIVE_FIELD}
              value={terrainText}
              vocab={vocabIndex}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
