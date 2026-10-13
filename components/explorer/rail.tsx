"use client";

import { useMemo, type RefObject } from "react";
import { Check, GitCommitHorizontal } from "lucide-react";
import {
  useCatalog,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { SearchBox } from "@/components/explorer/search-box";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Caption,
  SectionLabel,
  Segmented,
  TypeIcon,
} from "@/components/ui/tide";
import { techniqueName } from "@/lib/explorer/catalog";
import { TYPE_COLOR_VAR, TYPE_PLURALS } from "@/lib/graph/type-icons";
import {
  formatActorFallbackLabel,
  lookupVocabTerm,
} from "@/lib/opentide/vocab";
import { OBJECT_TYPES } from "@/lib/opentide/types";
import { hasClause, type RelationMode } from "@/lib/search/filters";
import { cn } from "@/lib/utils";

const SCOPE_OPTIONS: Array<{ value: RelationMode; label: string }> = [
  { value: "match-only", label: "matches" },
  { value: "include-neighbors", label: "neighbours" },
  { value: "include-chain", label: "chains" },
];

const SCOPE_HELP: Record<RelationMode, string> = {
  "match-only": "Only what the search matches.",
  "include-neighbors": "Matches and the objects they link to directly.",
  "include-chain":
    "Matches with their whole detection chain, and the threats chained to it.",
};

function topValues(values: string[][], limit: number) {
  const counts = new Map<string, number>();
  for (const list of values) {
    for (const value of new Set(list))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function FacetChip({
  label,
  count,
  on,
  onClick,
  hint,
}: {
  label: string;
  count?: number;
  on: boolean;
  onClick: () => void;
  hint?: string;
}) {
  const chip = (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] leading-4 transition-colors",
        on
          ? "border-transparent bg-accent text-accent-fg"
          : "border-line text-muted hover:border-accent/45 hover:text-ink",
      )}
    >
      <span className="truncate">{label}</span>
      {count != null ? (
        <span className={on ? "text-accent-fg/70" : "text-subtle"}>
          {count}
        </span>
      ) : null}
    </button>
  );
  if (!hint) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-64">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The corpus rail: search, the four object types with what the search leaves of each, how far
 * a match reaches, and the corpus's most common integrations, techniques and actors.
 */
export function Rail({
  searchRef,
  className,
}: {
  searchRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const catalog = useCatalog();
  const actions = useExplorerActions();
  const query = useExplorer((s) => s.query);
  const filters = useExplorer((s) => s.filters);
  const visibleIds = useExplorer((s) => s.visibleIds);
  const matchIds = useExplorer((s) => s.matchIds);
  const { overview, bundle } = catalog;

  const visibleByType = useMemo(() => {
    const counts = { threat: 0, objective: 0, signal: 0, rule: 0 };
    for (const id of visibleIds) {
      const type = catalog.summaries.get(id)?.type;
      if (type) counts[type] += 1;
    }
    return counts;
  }, [catalog, visibleIds]);

  const techniques = useMemo(
    () =>
      topValues(
        bundle.summaries
          .filter((s) => s.type === "threat")
          .map((s) => s.techniques),
        10,
      ),
    [bundle.summaries],
  );
  const actors = useMemo(
    () =>
      topValues(
        bundle.summaries.map((s) => s.actors),
        8,
      ),
    [bundle.summaries],
  );

  const searching = matchIds != null;

  return (
    <div
      className={cn(
        "tide-panel flex h-full min-h-0 w-full flex-col overflow-hidden",
        className,
      )}
    >
      <div className="shrink-0 border-b border-line p-3">
        <SearchBox inputRef={searchRef} />
      </div>

      <div className="tide-scroll min-h-0 flex-1 space-y-7 overflow-y-auto px-4 pt-5 pb-6">
        <section aria-labelledby="rail-objects">
          <SectionLabel
            n={1}
            aside={
              searching
                ? `${matchIds.size} match${matchIds.size === 1 ? "" : "es"}`
                : null
            }
          >
            <span id="rail-objects">objects</span>
          </SectionLabel>
          <ul className="mt-3 space-y-1">
            {OBJECT_TYPES.map((type) => {
              const total = overview.counts[type];
              const shown = visibleByType[type];
              const on = filters.types.includes(type);
              const share = total ? shown / total : 0;
              return (
                <li key={type}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => actions.toggleToken("type", type)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-2 py-2 text-left transition-colors",
                      on ? "bg-accent/8" : "hover:bg-hover",
                    )}
                  >
                    <TypeIcon type={type} size="md" active={on} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium capitalize text-ink">
                          {TYPE_PLURALS[type]}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-subtle">
                          {shown === total ? total : `${shown}/${total}`}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/6"
                      >
                        <span
                          className="block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                          style={{
                            width: `${Math.max(share * 100, shown ? 3 : 0)}%`,
                            backgroundColor: TYPE_COLOR_VAR[type],
                          }}
                        />
                      </span>
                    </span>
                    {on ? (
                      <Check className="size-3.5 text-accent" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="rail-scope">
          <SectionLabel n={2}>
            <span id="rail-scope">reach</span>
          </SectionLabel>
          <Segmented
            className="mt-3 w-full [&>button]:flex-1 [&>button]:justify-center"
            role="group"
            size="sm"
            label="How far a match reaches"
            value={filters.relationMode}
            options={SCOPE_OPTIONS}
            onChange={actions.setRelationMode}
          />
          <Caption className="mt-2 font-sans text-xs text-subtle">
            {SCOPE_HELP[filters.relationMode]}
          </Caption>
        </section>

        {overview.platforms.length ? (
          <section aria-labelledby="rail-integrations">
            <SectionLabel n={3}>
              <span id="rail-integrations">integrations</span>
            </SectionLabel>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {overview.platforms.map((platform) => {
                const value = platform.name.replace(/_/g, " ");
                return (
                  <FacetChip
                    key={platform.name}
                    label={value}
                    count={platform.rules}
                    on={hasClause(query, "platform", value)}
                    onClick={() => actions.toggleToken("platform", value)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {techniques.length ? (
          <section aria-labelledby="rail-techniques">
            <SectionLabel n={4}>
              <span id="rail-techniques">top techniques</span>
            </SectionLabel>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {techniques.map(([id, count]) => (
                <FacetChip
                  key={id}
                  label={id}
                  count={count}
                  hint={techniqueName(catalog.vocab, id)}
                  on={hasClause(query, "technique", id)}
                  onClick={() => actions.toggleToken("technique", id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {actors.length ? (
          <section aria-labelledby="rail-actors">
            <SectionLabel n={5}>
              <span id="rail-actors">threat actors</span>
            </SectionLabel>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {actors.map(([actor, count]) => {
                const term = lookupVocabTerm(catalog.vocab, "actors", actor);
                const label = term
                  ? term.name.replace(/^\[(Enterprise|ICS|Mobile)\]\s+/, "")
                  : formatActorFallbackLabel(actor);
                return (
                  <FacetChip
                    key={actor}
                    label={label}
                    count={count}
                    hint={
                      term?.aliases?.length
                        ? `aka ${term.aliases.slice(0, 4).join(", ")}`
                        : undefined
                    }
                    on={hasClause(query, "actor", actor)}
                    onClick={() => actions.toggleToken("actor", actor)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-line px-4 py-3">
        <SourceLine />
      </footer>
    </div>
  );
}

function SourceLine() {
  const { bundle } = useCatalog();
  const generated = bundle.generatedAt ? new Date(bundle.generatedAt) : null;
  const date =
    generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;
  const source = bundle.source;
  const short = source?.ref ? source.ref.slice(0, 7) : null;
  const repo = source?.repository.replace(
    /^https?:\/\/(www\.)?github\.com\//,
    "",
  );

  return (
    <p className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-subtle">
      <GitCommitHorizontal className="size-3.5 shrink-0" aria-hidden />
      {source ? (
        <a
          href={
            short
              ? `${source.repository}/tree/${source.ref}`
              : source.repository
          }
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate transition-colors hover:text-ink"
        >
          {repo}
          {short ? `@${short}` : ""}
        </a>
      ) : (
        <span>local corpus</span>
      )}
      {date ? <span className="ml-auto shrink-0">{date}</span> : null}
    </p>
  );
}
