"use client";

import { useMemo } from "react";
import { ExplorerCanvas } from "@/components/graph/explorer-canvas";
import {
  ObjectDescriptionPanel,
  ObjectMetadataTabs,
  ObjectRelationsPanel,
  ObjectTitleBar,
  PanelEmptyState,
} from "@/components/objects/object-detail-panel";
import { ThreatTerrainPanel } from "@/components/objects/threat-terrain-panel";
import type { ObjectBody } from "@/lib/opentide/types";
import { SearchPanel } from "@/components/search/token-search-pill";
import { CommandPalette } from "@/components/shell/command-palette";
import { ExplorerLayout } from "@/components/shell/explorer-layout";
import { useExplorer } from "@/components/shell/explorer-context";
import { ExplorerHeader } from "@/components/shell/explorer-header";

function getThreatTerrainPanelData(
  body: ObjectBody,
): { surface?: unknown; terrain?: unknown } | null {
  const threat = body["threat"] as ObjectBody | undefined;
  if (!threat) return null;

  const surface = threat["surface"];
  const terrain = threat["terrain"];
  const hasSurface = Array.isArray(surface) && surface.length > 0;
  const hasTerrain = typeof terrain === "string" && terrain.trim().length > 0;

  if (!hasSurface && !hasTerrain) return null;

  return {
    ...(hasSurface ? { surface } : {}),
    ...(hasTerrain ? { terrain } : {}),
  };
}

export function ExplorerShell() {
  const { selectedId, bundle, getSummary } = useExplorer();
  const summary = selectedId ? getSummary(selectedId) : null;
  const body = selectedId ? bundle.flatIndex[selectedId] : null;
  const hasSelection = Boolean(summary && body);
  const threatTerrainPanel =
    hasSelection && summary?.type === "threat" && body
      ? getThreatTerrainPanelData(body)
      : null;

  const description = useMemo(
    () =>
      hasSelection && summary && body ? (
        <ObjectDescriptionPanel summary={summary} body={body} />
      ) : (
        <PanelEmptyState message="No object selected" />
      ),
    [hasSelection, summary, body],
  );

  const terrain = useMemo(
    () =>
      threatTerrainPanel ? (
        <ThreatTerrainPanel
          surface={threatTerrainPanel.surface}
          terrain={threatTerrainPanel.terrain}
        />
      ) : null,
    [threatTerrainPanel],
  );

  const title = useMemo(
    () =>
      hasSelection && summary && body ? (
        <ObjectTitleBar summary={summary} body={body} />
      ) : (
        <PanelEmptyState message="No object selected" compact />
      ),
    [hasSelection, summary, body],
  );

  const metadata = useMemo(
    () =>
      hasSelection && summary && body ? (
        <ObjectMetadataTabs summary={summary} body={body} />
      ) : (
        <PanelEmptyState message="No object selected" />
      ),
    [hasSelection, summary, body],
  );

  const relations = useMemo(
    () =>
      hasSelection && summary ? (
        <ObjectRelationsPanel summary={summary} body={body ?? undefined} />
      ) : (
        <PanelEmptyState message="No object selected" />
      ),
    [hasSelection, summary, body],
  );

  const header = useMemo(() => <ExplorerHeader />, []);
  const graph = useMemo(() => <ExplorerCanvas />, []);
  const bottomBar = useMemo(() => <SearchPanel />, []);
  return (
    <>
      <ExplorerLayout
        header={header}
        graph={graph}
        bottomBar={bottomBar}
        description={description}
        terrain={terrain}
        title={title}
        metadata={metadata}
        relations={relations}
      />
      <CommandPalette />
    </>
  );
}
