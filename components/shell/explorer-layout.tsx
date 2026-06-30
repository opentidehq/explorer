"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ExplorerBar } from "@/components/shell/explorer-chrome";
import { ResizeHandle } from "@/components/shell/resize-handle";
import {
  clamp,
  PANEL_LAYOUT_DEFAULTS,
  PANEL_LAYOUT_STORAGE,
  readStoredPanelSize,
  writeStoredPanelSize,
} from "@/lib/shell/panel-layout";
import { cn } from "@/lib/utils";

export function ExplorerPanel({
  children,
  className,
  noBorder,
  overflowVisible,
  style,
}: {
  children: ReactNode;
  className?: string;
  noBorder?: boolean;
  overflowVisible?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "min-h-0 min-w-0 bg-card",
        !noBorder && "border-border/20",
        overflowVisible ? "overflow-visible" : "overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface ExplorerLayoutProps {
  header: ReactNode;
  description: ReactNode;
  terrain?: ReactNode | null;
  title: ReactNode;
  graph: ReactNode;
  bottomBar: ReactNode;
  metadata: ReactNode;
  relations: ReactNode;
}

export function ExplorerLayout({
  header,
  description,
  terrain,
  title,
  graph,
  bottomBar,
  metadata,
  relations,
}: ExplorerLayoutProps) {
  const hasTerrain = terrain != null;
  const [leftWidth, setLeftWidth] = useState(PANEL_LAYOUT_DEFAULTS.leftWidth);
  const [rightWidth, setRightWidth] = useState(
    PANEL_LAYOUT_DEFAULTS.rightWidth,
  );
  const [relationsHeight, setRelationsHeight] = useState(
    PANEL_LAYOUT_DEFAULTS.relationsHeight,
  );
  const [terrainHeight, setTerrainHeight] = useState(
    PANEL_LAYOUT_DEFAULTS.terrainHeight,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLeftWidth(
      readStoredPanelSize(
        PANEL_LAYOUT_STORAGE.left,
        PANEL_LAYOUT_DEFAULTS.leftWidth,
        PANEL_LAYOUT_DEFAULTS.minLeftWidth,
        PANEL_LAYOUT_DEFAULTS.maxLeftWidth,
      ),
    );
    setRightWidth(
      readStoredPanelSize(
        PANEL_LAYOUT_STORAGE.right,
        PANEL_LAYOUT_DEFAULTS.rightWidth,
        PANEL_LAYOUT_DEFAULTS.minRightWidth,
        PANEL_LAYOUT_DEFAULTS.maxRightWidth,
      ),
    );
    setRelationsHeight(
      readStoredPanelSize(
        PANEL_LAYOUT_STORAGE.relations,
        PANEL_LAYOUT_DEFAULTS.relationsHeight,
        PANEL_LAYOUT_DEFAULTS.minRelationsHeight,
        PANEL_LAYOUT_DEFAULTS.maxRelationsHeight,
      ),
    );
    setTerrainHeight(
      readStoredPanelSize(
        PANEL_LAYOUT_STORAGE.terrain,
        PANEL_LAYOUT_DEFAULTS.terrainHeight,
        PANEL_LAYOUT_DEFAULTS.minTerrainHeight,
        PANEL_LAYOUT_DEFAULTS.maxTerrainHeight,
      ),
    );
    setReady(true);
  }, []);

  const persistLeft = useCallback(() => {
    writeStoredPanelSize(PANEL_LAYOUT_STORAGE.left, leftWidth);
  }, [leftWidth]);

  const persistRight = useCallback(() => {
    writeStoredPanelSize(PANEL_LAYOUT_STORAGE.right, rightWidth);
  }, [rightWidth]);

  const persistRelations = useCallback(() => {
    writeStoredPanelSize(PANEL_LAYOUT_STORAGE.relations, relationsHeight);
  }, [relationsHeight]);

  const persistTerrain = useCallback(() => {
    writeStoredPanelSize(PANEL_LAYOUT_STORAGE.terrain, terrainHeight);
  }, [terrainHeight]);

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-background">
      {header}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex shrink-0 flex-col"
          style={
            ready
              ? { width: leftWidth }
              : { width: PANEL_LAYOUT_DEFAULTS.leftWidth }
          }
        >
          <ExplorerPanel className="min-h-0 flex-1 border-r">
            {description}
          </ExplorerPanel>

          {hasTerrain ? (
            <>
              <ResizeHandle
                direction="vertical"
                onResize={(delta) =>
                  setTerrainHeight((height) =>
                    clamp(
                      height - delta,
                      PANEL_LAYOUT_DEFAULTS.minTerrainHeight,
                      PANEL_LAYOUT_DEFAULTS.maxTerrainHeight,
                    ),
                  )
                }
                onResizeEnd={persistTerrain}
              />

              <ExplorerPanel
                className="shrink-0 border-r"
                style={
                  ready
                    ? { height: terrainHeight }
                    : { height: PANEL_LAYOUT_DEFAULTS.terrainHeight }
                }
              >
                {terrain}
              </ExplorerPanel>
            </>
          ) : null}
        </div>

        <ResizeHandle
          direction="horizontal"
          onResize={(delta) =>
            setLeftWidth((width) =>
              clamp(
                width + delta,
                PANEL_LAYOUT_DEFAULTS.minLeftWidth,
                PANEL_LAYOUT_DEFAULTS.maxLeftWidth,
              ),
            )
          }
          onResizeEnd={persistLeft}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ExplorerPanel className="shrink-0">
            <ExplorerBar edge="bottom">{title}</ExplorerBar>
          </ExplorerPanel>

          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
            {graph}
          </div>

          <ExplorerPanel overflowVisible>
            <ExplorerBar edge="top">{bottomBar}</ExplorerBar>
          </ExplorerPanel>
        </div>

        <ResizeHandle
          direction="horizontal"
          onResize={(delta) =>
            setRightWidth((width) =>
              clamp(
                width - delta,
                PANEL_LAYOUT_DEFAULTS.minRightWidth,
                PANEL_LAYOUT_DEFAULTS.maxRightWidth,
              ),
            )
          }
          onResizeEnd={persistRight}
        />

        <div
          className="flex shrink-0 flex-col"
          style={
            ready
              ? { width: rightWidth }
              : { width: PANEL_LAYOUT_DEFAULTS.rightWidth }
          }
        >
          <ExplorerPanel className="min-h-0 flex-1 border-l">
            {metadata}
          </ExplorerPanel>

          <ResizeHandle
            direction="vertical"
            onResize={(delta) =>
              setRelationsHeight((height) =>
                clamp(
                  height - delta,
                  PANEL_LAYOUT_DEFAULTS.minRelationsHeight,
                  PANEL_LAYOUT_DEFAULTS.maxRelationsHeight,
                ),
              )
            }
            onResizeEnd={persistRelations}
          />

          <ExplorerPanel
            className="shrink-0 border-l"
            style={
              ready
                ? { height: relationsHeight }
                : { height: PANEL_LAYOUT_DEFAULTS.relationsHeight }
            }
          >
            {relations}
          </ExplorerPanel>
        </div>
      </div>
    </div>
  );
}
