"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Search, X } from "lucide-react";
import {
  useCatalog,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { Kbd } from "@/components/ui/tide";
import {
  activeFilterCount,
  withoutDeploy,
  withoutFreeText,
  type CatalogFilters,
  type ClauseOperator,
} from "@/lib/search/filters";
import {
  applySuggestion,
  getTokenSuggestions,
  type TokenSuggestion,
} from "@/lib/search/token-autocomplete";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<TokenSuggestion["kind"], string> = {
  field: "field",
  operator: "op",
  value: "value",
  boolean: "and/or",
};

interface Chip {
  key: string;
  label: string;
  field: string | null;
  op: ClauseOperator;
  value: string;
}

function filterChips(filters: CatalogFilters): Chip[] {
  const chips: Chip[] = [];
  const add = (field: string, values: string[], op: ClauseOperator = ":") => {
    for (const value of values) {
      chips.push({
        key: `${field}${op}${value}`,
        label: `${field}${op}${value}`,
        field,
        op,
        value,
      });
    }
  };
  add("type", filters.types);
  add("platform", filters.platforms);
  add("technique", filters.techniques);
  add("actor", filters.actors);
  add(
    "status",
    filters.statuses.filter((s) => !["STAGING", "PRODUCTION"].includes(s)),
  );
  add("schema", filters.schemas);
  add("tlp", filters.tlps);
  if (filters.uuid) add("uuid", [filters.uuid]);
  if (filters.stagingOnly) add("deploy", ["staging"]);
  if (filters.productionOnly) add("deploy", ["production"]);
  const ex = filters.exclude;
  add("type", ex.types, "!=");
  add("platform", ex.platforms, "!=");
  add("technique", ex.techniques, "!=");
  add("actor", ex.actors, "!=");
  add("status", ex.statuses, "!=");
  add("schema", ex.schemas, "!=");
  add("tlp", ex.tlps, "!=");
  add("uuid", ex.uuids, "!=");
  add("deploy", ex.deploy, "!=");
  if (filters.query.trim()) {
    chips.unshift({
      key: "text",
      label: `“${filters.query.trim()}”`,
      field: null,
      op: ":",
      value: filters.query.trim(),
    });
  }
  return chips;
}

/**
 * The search field: free text and `field:value` clauses (`type:rule technique:T1059`), with
 * suggestions drawn from the corpus and its vocabularies.
 */
export function SearchBox({
  inputRef,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const catalog = useCatalog();
  const query = useExplorer((s) => s.query);
  const filters = useExplorer((s) => s.filters);
  const actions = useExplorerActions();
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  // Moved through the list with the arrow keys since the last edit; read only on keys.
  const browsed = useRef(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const { context, suggestions } = useMemo(
    () => getTokenSuggestions(query, cursor, catalog.tokens, 30),
    [query, cursor, catalog.tokens],
  );
  const open = focused && suggestions.length > 0;
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1));
  const chips = useMemo(() => filterChips(filters), [filters]);

  const choose = (suggestion: TokenSuggestion) => {
    const { next, cursor: at } = applySuggestion(query, context, suggestion);
    actions.setQuery(next);
    setCursor(at);
    setActive(0);
    browsed.current = false;
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(at, at);
      ref.current?.focus();
    });
  };

  const move = (step: number) => {
    const next = (activeIndex + step + suggestions.length) % suggestions.length;
    setActive(next);
    browsed.current = true;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    // Tab completes what is being typed, or the suggestion the arrows reached; with nothing
    // to complete it moves on, so the field never traps focus.
    const completes =
      event.key === "Enter" ||
      (event.key === "Tab" &&
        !event.shiftKey &&
        (browsed.current || context.partial.length > 0));
    if (open && completes) {
      const suggestion = suggestions[activeIndex];
      if (suggestion) {
        event.preventDefault();
        choose(suggestion);
      }
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      if (open) setFocused(false);
      else if (query) actions.setQuery("");
      else ref.current?.blur();
    }
  };

  const hasFilters = activeFilterCount(filters) > 0 || query.length > 0;

  return (
    <div className="relative">
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border bg-panel px-3 transition-[border-color,box-shadow]",
          focused
            ? "border-accent/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--tide-accent)_14%,transparent)]"
            : "border-line hover:border-ink/20",
        )}
      >
        <Search className="size-4 shrink-0 text-subtle" aria-hidden />
        <input
          ref={ref}
          type="search"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open ? `${listboxId}-${activeIndex}` : undefined
          }
          aria-label="Search the library"
          placeholder="Search threats, techniques, rules…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            actions.setQuery(event.target.value);
            setCursor(event.target.selectionStart ?? event.target.value.length);
            setActive(0);
            browsed.current = false;
          }}
          onSelect={(event) =>
            setCursor(
              event.currentTarget.selectionStart ??
                event.currentTarget.value.length,
            )
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              actions.resetFilters();
              ref.current?.focus();
            }}
            className="inline-flex size-6 items-center justify-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-ink"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <Kbd>/</Kbd>
        )}
      </div>

      {open ? (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Suggestions"
          className="tide-scroll absolute inset-x-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-float"
        >
          {suggestions.map((suggestion, index) => (
            // Focus stays in the input; it points here with aria-activedescendant.
            // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
            <div
              key={`${suggestion.kind}-${suggestion.label}-${index}`}
              id={`${listboxId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px]",
                index === activeIndex ? "bg-accent/10 text-ink" : "text-muted",
              )}
            >
              <span className="w-12 shrink-0 font-mono text-[10px] text-subtle">
                {KIND_LABEL[suggestion.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {suggestion.label}
              </span>
              {suggestion.description ? (
                <span className="max-w-[45%] shrink truncate text-[11px] text-subtle">
                  {suggestion.description}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {chips.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => {
                  if (chip.field === "deploy" && chip.op === ":") {
                    actions.setQuery(
                      withoutDeploy(
                        query,
                        chip.value as "staging" | "production",
                      ),
                    );
                  } else if (chip.field) {
                    actions.toggleToken(chip.field, chip.value, chip.op);
                  } else {
                    actions.setQuery(withoutFreeText(query, filters));
                  }
                }}
                className="group inline-flex max-w-full items-center gap-1 rounded-full bg-accent/10 py-0.5 pl-2 pr-1 font-mono text-[11px] text-accent transition-colors hover:bg-accent/15"
                aria-label={`Remove ${chip.label}`}
              >
                <span className="truncate">{chip.label}</span>
                <X
                  className="size-3 opacity-60 group-hover:opacity-100"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
