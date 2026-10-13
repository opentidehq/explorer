"use client";

import {
  ArrowRight,
  Info,
  Network,
  Rows3,
  Search,
  SlidersHorizontal,
  Grid3x3,
} from "lucide-react";
import {
  OpentideMark,
  OpentideWordmark,
} from "@/components/brand/opentide-mark";
import {
  EXPLORER_VIEW_LABELS,
  useCatalog,
  useExplorer,
  useExplorerActions,
  type ExplorerView,
} from "@/components/explorer/explorer-state";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Kbd, Segmented, type SegmentOption } from "@/components/ui/tide";
import { GitHubIcon } from "@/components/ui/github-icon";

const VIEW_OPTIONS: SegmentOption<ExplorerView>[] = [
  {
    value: "graph",
    label: EXPLORER_VIEW_LABELS.graph,
    icon: Network,
    compactLabel: true,
  },
  {
    value: "catalogue",
    label: EXPLORER_VIEW_LABELS.catalogue,
    icon: Rows3,
    compactLabel: true,
  },
  {
    value: "attack",
    label: EXPLORER_VIEW_LABELS.attack,
    icon: Grid3x3,
    compactLabel: true,
  },
];

const QUICKSTART = "https://opentide.org/docs/usage/quickstart/";
const DEFAULT_REPOSITORY = "https://github.com/OpenTideHQ/library";

/**
 * The explorer's header: opentide.org's floating glass pill. Brand and corpus on the left, the
 * three views in the middle, search and site actions on the right.
 */
export function Header({ onOpenOverview }: { onOpenOverview: () => void }) {
  const catalog = useCatalog();
  const view = useExplorer((s) => s.view);
  const actions = useExplorerActions();
  const repository = catalog.bundle.source?.repository ?? DEFAULT_REPOSITORY;
  const total = catalog.bundle.summaries.length;

  return (
    <header className="shrink-0 px-3 pt-3 pb-3">
      <div className="tide-pill grid h-[52px] grid-cols-[auto_1fr_auto] items-center gap-1.5 px-1.5 sm:grid-cols-[1fr_auto_1fr] sm:gap-2 sm:px-2">
        <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
          <button
            type="button"
            className="tide-pill-icon lg:hidden"
            aria-label="Filters"
            onClick={() => actions.setRailOpen(true)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
          </button>
          <a
            href="https://opentide.org"
            aria-label="opentide.org"
            className="flex shrink-0 items-center rounded-full"
          >
            <OpentideWordmark
              height={34}
              className="hidden h-[34px] w-auto sm:block"
            />
            <OpentideMark size={34} className="sm:hidden" />
          </a>
          <span
            aria-hidden
            className="mx-1.5 hidden h-5 w-px bg-line sm:block"
          />
          <span className="hidden min-w-0 items-baseline gap-2 sm:flex">
            <span className="text-sm font-semibold tracking-[-0.01em]">
              library
            </span>
            <span className="hidden truncate font-mono text-[11px] text-subtle md:inline">
              {total} objects
            </span>
          </span>
        </div>

        <Segmented
          label="Explorer view"
          value={view}
          options={VIEW_OPTIONS}
          onChange={actions.setView}
          className="justify-self-center"
        />

        <div className="flex items-center gap-0.5 justify-self-end sm:gap-1">
          <button
            type="button"
            onClick={() => actions.setPaletteOpen(true)}
            className="group hidden h-9 items-center gap-2 rounded-full border border-line bg-panel/60 pl-3 pr-1.5 text-[13px] text-subtle transition-colors hover:border-accent/40 hover:text-ink md:inline-flex"
          >
            <Search className="size-3.5" aria-hidden />
            Jump to
            <Kbd className="ml-2">⌘K</Kbd>
          </button>
          <button
            type="button"
            aria-label="Search"
            onClick={() => actions.setPaletteOpen(true)}
            className="tide-pill-icon md:hidden"
          >
            <Search className="size-4" aria-hidden />
          </button>
          <a
            href={repository}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="The library on GitHub"
            className="tide-pill-icon hidden sm:inline-flex"
          >
            <GitHubIcon className="size-4" />
          </a>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Library overview"
            onClick={onOpenOverview}
            className="tide-pill-icon lg:hidden"
          >
            <Info className="size-4" aria-hidden />
          </button>
          <a
            href={QUICKSTART}
            className="tide-pill-cta group ml-1 hidden xl:inline-flex"
          >
            Get started
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>
        </div>
      </div>
    </header>
  );
}
