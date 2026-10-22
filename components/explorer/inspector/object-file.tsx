"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useCatalog } from "@/components/explorer/explorer-state";
import { CodePanel } from "@/components/code/code-panel";
import { sourceUrl } from "@/lib/explorer/fields";
import { SIGNAL_OBJECTIVE_KEY } from "@/lib/opentide/graph";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

/** Whether a signal is one an objective embeds, promoted to an object by the bundle. */
function isEmbeddedSignal(summary: BundleObjectSummary, body: ObjectBody) {
  return (
    summary.type === "signal" &&
    (typeof body[SIGNAL_OBJECTIVE_KEY] === "string" ||
      typeof body["parent"] === "string")
  );
}

/** What the file says. Embedded signals show without the fields the bundle adds to them. */
function fileBody(summary: BundleObjectSummary, body: ObjectBody): ObjectBody {
  if (!isEmbeddedSignal(summary, body)) return body;
  const {
    metadata: _metadata,
    [SIGNAL_OBJECTIVE_KEY]: objective,
    ...signal
  } = body;
  // Bundles from earlier generators wrote the objective over the signal's `parent`.
  if (objective === undefined) delete signal["parent"];
  return signal;
}

/** The object as YAML, in a deep-tide panel, with a link to the file at the bundle's commit. */
export function ObjectFile({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const { bundle } = useCatalog();
  const [yaml, setYaml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The YAML serialiser loads only when a file is opened. If its chunk cannot load,
    // show the object as JSON rather than a skeleton that never resolves.
    const content = fileBody(summary, body);
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
  }, [summary, body]);

  const embedded = isEmbeddedSignal(summary, body);
  const url = sourceUrl(bundle.source, summary.path);
  const caption = summary.path
    ? `${summary.path}${embedded ? " · objective.signals[]" : ""}`
    : `${summary.type}::${summary.uuid}`;

  if (yaml == null) {
    return (
      <div
        className="h-64 rounded-2xl bg-code/90 motion-safe:animate-pulse"
        aria-hidden
      />
    );
  }

  return (
    <CodePanel
      code={yaml}
      language="yaml"
      caption={caption}
      lineNumbers
      maxHeight="none"
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
