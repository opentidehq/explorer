"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useCatalog } from "@/components/explorer/explorer-state";
import type { Position } from "@/lib/lsp/protocol";
import {
  languageService,
  type ObjectSnapshot,
  type ServerStatus,
} from "@/lib/lsp/service";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

const IDLE: ServerStatus = { state: "idle" };
const NOTHING: ObjectSnapshot = { document: null, analysis: null, error: null };

/** The language server's state: idle until something asks, then loading, ready or unavailable. */
export function useLanguageServerStatus(): ServerStatus {
  const service = languageService();
  return useSyncExternalStore(service.subscribe, service.getStatus, () => IDLE);
}

export interface ObjectAnalysisState extends ObjectSnapshot {
  /** Hover in this object's document. */
  hover: (position: Position) => Promise<string | null>;
}

/**
 * An object's document, and, when `enabled`, the language server's analysis of it. The
 * page's language service keeps both, so a second panel or tab reads them at once.
 */
export function useObjectAnalysis(
  summary: BundleObjectSummary,
  body: ObjectBody,
  enabled: boolean,
): ObjectAnalysisState {
  const { bundle } = useCatalog();
  const service = languageService();
  const snapshot = useSyncExternalStore(
    service.subscribe,
    () => service.snapshot(summary.uuid),
    () => NOTHING,
  );

  useEffect(() => {
    // Failures land in the snapshot's `error`.
    service.document(summary, body).catch(() => {});
    if (!enabled) return;
    service.setWorkspace(
      bundle.summaries.map((s) => ({
        uuid: s.uuid,
        schema: s.schema ?? `${s.type}::1.0`,
        name: s.name,
      })),
    );
    service.analyze(summary, body).catch(() => {});
  }, [service, summary, body, enabled, bundle]);

  const uri = snapshot.document?.uri;
  const hover = useCallback(
    (position: Position) =>
      uri ? service.hover(uri, position) : Promise.resolve(null),
    [service, uri],
  );
  return { ...snapshot, hover };
}
