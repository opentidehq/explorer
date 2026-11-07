"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useCatalog, useExplorer } from "@/components/explorer/explorer-state";
import { CodePanel, type PanelAnalysis } from "@/components/code/code-panel";
import { useObjectAnalysis } from "@/components/code/use-object-analysis";
import { sourceUrl } from "@/lib/explorer/fields";
import { fileBody, isEmbeddedSignal } from "@/lib/explorer/object-file";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

/** An embedded signal's YAML: the part of its objective's file it is, not an object. */
function useEmbeddedYaml(body: ObjectBody, embedded: boolean) {
  const [yaml, setYaml] = useState<string | null>(null);
  useEffect(() => {
    if (!embedded) return;
    let cancelled = false;
    // The YAML serialiser loads only when a file is opened. If its chunk cannot load,
    // show the object as JSON rather than a skeleton that never resolves.
    const content = fileBody(body, embedded);
    import("yaml")
      .then(({ stringify }) => {
        if (!cancelled) setYaml(stringify(content, { lineWidth: 0 }));
      })
      .catch(() => {
        if (!cancelled) setYaml(JSON.stringify(content, null, 2));
      });
    return () => {
      cancelled = true;
    };
  }, [body, embedded]);
  return yaml;
}

/**
 * The object as YAML, in a deep-tide panel, with a link to the file at the bundle's commit.
 * An object (not an embedded signal) is the document the language server analyses: the
 * panel shows its semantic tokens, findings and hover.
 */
export function ObjectFile({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const { bundle, summaries } = useCatalog();
  const embedded = isEmbeddedSignal(
    summary,
    body,
    (id) => summaries.get(id)?.type === "objective",
  );
  const embeddedYaml = useEmbeddedYaml(body, embedded);
  const { document, analysis, error, hover } = useObjectAnalysis(
    summary,
    body,
    !embedded,
  );
  const reveal = useExplorer((s) => s.fileReveal);

  const panelAnalysis = useMemo<PanelAnalysis | null>(
    () =>
      analysis
        ? {
            tokens: analysis.tokens,
            diagnostics: analysis.diagnostics,
            hover,
          }
        : null,
    [analysis, hover],
  );

  const url = sourceUrl(bundle.source, summary.path);
  const caption = summary.path
    ? `${summary.path}${embedded ? " · objective.signals[]" : ""}`
    : `${summary.type}::${summary.uuid}`;
  // A document that could not be built (the YAML chunk did not load): the object as JSON.
  const code = embedded
    ? embeddedYaml
    : (document?.text ??
      (error ? JSON.stringify(fileBody(body, false), null, 2) : null));

  if (code == null) {
    return (
      <div
        className="h-64 rounded-2xl bg-code/90 motion-safe:animate-pulse"
        aria-hidden
      />
    );
  }

  return (
    <CodePanel
      code={code}
      language="yaml"
      caption={caption}
      lineNumbers
      maxHeight="none"
      analysis={embedded ? null : panelAnalysis}
      revealLine={reveal?.line ?? null}
      key={reveal?.nonce}
      aside={
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-code-dim transition-colors hover:bg-white/10 hover:text-code-ink"
          >
            github <ArrowUpRight className="size-3" aria-hidden />
          </a>
        ) : null
      }
    />
  );
}
