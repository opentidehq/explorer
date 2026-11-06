"use client";

import { Radar } from "lucide-react";
import { isDesktop } from "@/components/explorer/breakpoints";
import {
  useCatalog,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { Section } from "@/components/explorer/inspector/object-overview";
import {
  logSourceKey,
  logSourcesFor,
  type LogSourceUse,
} from "@/lib/opentide/visibility";

const HOW: Record<LogSourceUse, string> = {
  query: "its query reads it",
  signal: "through a signal",
  objective: "a signal names it",
};

/**
 * The log sources a rule, signal or objective uses, each opening its page in the Visibility
 * view. Nothing without a visibility export. Below the desktop breakpoint the inspector is a
 * sheet over the stage, so opening a page closes it (clears the selection, which is what
 * keeps the sheet open); on the desktop the selection stays beside the page.
 */
export function ObjectLogSources({ id }: { id: string }) {
  const { visibility } = useCatalog();
  const actions = useExplorerActions();
  const uses = logSourcesFor(visibility, id);
  if (!uses.length) return null;
  return (
    <Section label="log sources" aside={String(uses.length)}>
      <ul className="grid gap-1.5">
        {uses.map(({ source, how }) => (
          <li key={logSourceKey(source)}>
            <button
              type="button"
              onClick={() => {
                if (!isDesktop()) actions.select(null);
                actions.openLogSource(logSourceKey(source));
              }}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:border-accent/45"
            >
              <Radar className="size-3.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                {source.name}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-subtle">
                {source.system} · {HOW[how]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
