"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Loader2, Search, X } from "lucide-react";
import { GraphLegend } from "@/components/search/graph-legend";
import { useExplorer } from "@/components/shell/explorer-context";
import { useIsClient } from "@/lib/hooks/use-is-client";
import {
  activeFilterCount,
  formatFilterTokens,
  parseFilterTokens,
} from "@/lib/search/filters";
import {
  applySuggestion,
  getTokenSuggestions,
  type TokenSuggestion,
} from "@/lib/search/token-autocomplete";
import { cn } from "@/lib/utils";

const ITEM_HEIGHT = 32;
const MAX_VISIBLE = 5;

function scrollSuggestionIntoView(
  list: HTMLDivElement | null,
  index: number,
  maxHeight: number,
) {
  if (!list || index < 0) return;
  const itemTop = index * ITEM_HEIGHT;
  const itemBottom = itemTop + ITEM_HEIGHT;
  if (itemTop < list.scrollTop) list.scrollTop = itemTop;
  else if (itemBottom > list.scrollTop + maxHeight)
    list.scrollTop = itemBottom - maxHeight;
}

function VirtualSuggestions({
  items,
  activeIndex,
  onSelect,
  listboxId,
  listRef,
}: {
  items: TokenSuggestion[];
  activeIndex: number;
  onSelect: (item: TokenSuggestion) => void;
  listboxId: string;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const maxHeight = ITEM_HEIGHT * MAX_VISIBLE;
  const totalHeight = items.length * ITEM_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 1);
  const visibleCount = Math.ceil(maxHeight / ITEM_HEIGHT) + 2;
  const end = Math.min(items.length, start + visibleCount);
  const slice = items.slice(start, end);

  if (!items.length) return null;

  return (
    <div
      ref={listRef}
      id={listboxId}
      className="max-h-40 overflow-y-auto overscroll-contain py-0.5"
      role="listbox"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <button
              key={`${item.kind}-${item.label}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "absolute left-0 right-0 flex w-full items-center gap-2 px-2.5 text-left text-xs transition-colors",
                index === activeIndex
                  ? "bg-primary/15 text-foreground"
                  : "text-foreground/90 hover:bg-muted/60",
              )}
              style={{
                top: index * ITEM_HEIGHT,
                height: ITEM_HEIGHT,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
            >
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase",
                  item.kind === "field"
                    ? "bg-primary/20 text-primary"
                    : item.kind === "operator"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                      : item.kind === "boolean"
                        ? "bg-violet-500/20 text-violet-700 dark:text-violet-400"
                        : "bg-muted text-muted-foreground",
                )}
              >
                {item.kind}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.label}
              </span>
              {item.description ? (
                <span className="hidden shrink truncate text-[10px] text-muted-foreground sm:inline">
                  {item.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useSearchInput() {
  const {
    filters,
    setFilters,
    resetFilters,
    isSearching,
    matchCount,
    visibleIds,
    setSelectedId,
    tokenVocabulary,
  } = useExplorer();

  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const mounted = useIsClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsListRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFiltersSyncRef = useRef(false);
  const listboxId = useId();

  const { context, suggestions } = useMemo(
    () => getTokenSuggestions(input, cursor, tokenVocabulary, 20),
    [input, cursor, tokenVocabulary],
  );

  const activeSuggestionIndex =
    suggestions.length === 0
      ? 0
      : Math.min(activeIndex, suggestions.length - 1);

  const showDropdown = mounted && focused && suggestions.length > 0;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      skipFiltersSyncRef.current = true;
      setFilters(parseFilterTokens(input));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, setFilters]);

  useEffect(() => {
    if (skipFiltersSyncRef.current) {
      skipFiltersSyncRef.current = false;
      return;
    }
    const serialized = formatFilterTokens(filters);
    setInput((current) => (current === serialized ? current : serialized));
  }, [filters]);

  const selectSuggestion = useCallback(
    (suggestion: TokenSuggestion) => {
      const { next, cursor: nextCursor } = applySuggestion(
        input,
        context,
        suggestion,
      );
      setInput(next);
      setCursor(nextCursor);
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(nextCursor, nextCursor);
        inputRef.current?.focus();
      });
    },
    [input, context],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = Math.min(i + 1, suggestions.length - 1);
          requestAnimationFrame(() =>
            scrollSuggestionIntoView(
              suggestionsListRef.current,
              next,
              ITEM_HEIGHT * MAX_VISIBLE,
            ),
          );
          return next;
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = Math.max(i - 1, 0);
          requestAnimationFrame(() =>
            scrollSuggestionIntoView(
              suggestionsListRef.current,
              next,
              ITEM_HEIGHT * MAX_VISIBLE,
            ),
          );
          return next;
        });
        return;
      }
      if (e.key === "Enter" && suggestions[activeSuggestionIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIndex]!);
        return;
      }
      if (e.key === "Tab" && suggestions[activeSuggestionIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIndex]!);
        return;
      }
    }
    if (e.key === "Escape") {
      setFocused(false);
    }
  };

  const hasFilters = activeFilterCount(filters) > 0 || input.length > 0;

  const clear = () => {
    resetFilters();
    setInput("");
    setSelectedId(null);
    inputRef.current?.focus();
  };

  return {
    input,
    setInput,
    setCursor,
    focused,
    setFocused,
    inputRef,
    onKeyDown,
    showDropdown,
    suggestions,
    activeIndex: activeSuggestionIndex,
    selectSuggestion,
    isSearching,
    matchCount,
    visibleIds,
    mounted,
    hasFilters,
    clear,
    listboxId,
    suggestionsListRef,
  };
}

export function SearchPanel() {
  const {
    input,
    setInput,
    setCursor,
    setFocused,
    inputRef,
    onKeyDown,
    showDropdown,
    suggestions,
    activeIndex,
    selectSuggestion,
    isSearching,
    matchCount,
    visibleIds,
    mounted,
    hasFilters,
    clear,
    listboxId,
    suggestionsListRef,
  } = useSearchInput();

  return (
    <div className="relative flex w-full min-w-0 items-center gap-3">
      <div className="pointer-events-none absolute bottom-full left-0 right-14 z-40 mb-2 flex justify-center px-2">
        <div className="pointer-events-auto">
          <GraphLegend />
        </div>
      </div>

      <div className="relative min-w-0 flex-1 overflow-visible">
        {showDropdown && (
          <div
            className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-border/30 bg-card shadow-xl"
            role="presentation"
          >
            <VirtualSuggestions
              items={suggestions}
              activeIndex={activeIndex}
              onSelect={selectSuggestion}
              listboxId={listboxId}
              listRef={suggestionsListRef}
            />
          </div>
        )}

        <div className="flex min-h-8 w-full items-center gap-2 border-b border-border/25 px-0.5">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) =>
              setCursor(
                e.currentTarget.selectionStart ?? e.currentTarget.value.length,
              )
            }
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="Search… type:rule AND platform:sentinel"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search catalog"
          />

          {isSearching ? (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-label="Searching"
            />
          ) : mounted ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {matchCount}·{visibleIds.size}
            </span>
          ) : null}

          {hasFilters && (
            <button
              type="button"
              onClick={clear}
              className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
