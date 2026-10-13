"use client";

import { useMemo } from "react";
import { useCatalog, useExplorer } from "@/components/explorer/explorer-state";
import { TypeDot } from "@/components/ui/tide";
import { TYPE_PLURALS } from "@/lib/graph/type-icons";
import { OBJECT_TYPES } from "@/lib/opentide/types";

/** What the marks mean, in the site's legend style: mono captions under the figure. */
export function GraphLegend({ showVocab }: { showVocab: boolean }) {
  return (
    <ul
      aria-label="Legend"
      className="pointer-events-none absolute bottom-3 left-3 z-10 m-0 hidden max-w-[calc(100%-5rem)] list-none flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-panel/85 px-3 py-2 font-mono text-[11px] text-subtle backdrop-blur sm:flex"
    >
      {OBJECT_TYPES.map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          <TypeDot type={type} />
          {TYPE_PLURALS[type]}
        </li>
      ))}
      {showVocab ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-vocab"
          />
          vocabulary
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="block w-6 border-t-[1.5px] border-accent/60"
        />
        detection
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="block w-6 border-t-[1.5px] border-dashed border-threat/70"
        />
        chaining
      </li>
    </ul>
  );
}

/** How much of the corpus is on screen. */
export function GraphStatus({ visible }: { visible: Set<string> }) {
  const catalog = useCatalog();
  const matchIds = useExplorer((s) => s.matchIds);
  const links = useMemo(() => {
    let count = 0;
    for (const edge of catalog.corpus.edges) {
      if (visible.has(edge.source) && visible.has(edge.target)) count += 1;
    }
    return count;
  }, [catalog.corpus.edges, visible]);
  const objects = [...visible].filter((id) => catalog.summaries.has(id)).length;

  return (
    <p className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-line bg-panel/85 px-3 py-1 font-mono text-[11px] text-subtle backdrop-blur">
      {matchIds ? (
        <>
          <span className="font-semibold text-accent">{matchIds.size}</span>{" "}
          matched ·{` ${objects}`} shown
        </>
      ) : (
        <>
          <span className="text-ink">{objects}</span> objects
        </>
      )}
      <span aria-hidden className="h-3 w-px bg-line" />
      {links} links
    </p>
  );
}
