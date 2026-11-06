"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Columns3,
  EyeOff,
  Radar,
  ShieldAlert,
} from "lucide-react";
import {
  useCatalog,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { Caption, Tag, TypeIcon } from "@/components/ui/tide";
import {
  findLogSource,
  logSourceKey,
  matchesLogSource,
  visibilityOverview,
  type Tlp,
  type VisibilityExport,
  type VisibilityLogSource,
  type VisibilityUndeclared,
} from "@/lib/opentide/visibility";
import { cn } from "@/lib/utils";

/** FIRST's TLP colours, as the badge on the view shows them. */
const TLP_STYLE: Record<Tlp, { bg: string; fg: string }> = {
  clear: { bg: "#ffffff", fg: "#000000" },
  green: { bg: "#33ff00", fg: "#000000" },
  amber: { bg: "#ffc000", fg: "#000000" },
  "amber+strict": { bg: "#ffc000", fg: "#000000" },
  red: { bg: "#ff2b2b", fg: "#ffffff" },
};

type Attention = "all" | "no-columns" | "unused" | "undeclared";

export function TlpBadge({ tlp }: { tlp: Tlp }) {
  const style = TLP_STYLE[tlp];
  return (
    <span
      className="inline-flex items-center rounded-md border border-ink/20 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      TLP:{tlp.toUpperCase()}
    </span>
  );
}

function Tile({
  value,
  label,
  detail,
  tone,
  onClick,
  pressed,
}: {
  value: number;
  label: string;
  detail?: string;
  tone?: "warn" | "danger";
  onClick?: () => void;
  pressed?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          "block font-mono text-2xl font-semibold tracking-[-0.02em]",
          tone === "warn" && value > 0 && "text-warn",
          tone === "danger" && value > 0 && "text-danger",
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 block text-[13px] font-medium text-ink">
        {label}
      </span>
      {detail ? (
        <span className="mt-0.5 block font-mono text-[11px] text-subtle">
          {detail}
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "rounded-2xl border bg-panel px-4 py-3 text-left",
    pressed ? "border-accent" : "border-line",
  );
  return onClick ? (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(className, "transition-colors hover:border-accent/45")}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function ObjectButton({ id }: { id: string }) {
  const { summaries } = useCatalog();
  const actions = useExplorerActions();
  const summary = summaries.get(id);
  if (!summary) {
    return <li className="truncate font-mono text-[11px] text-subtle">{id}</li>;
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => actions.select(id)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel px-2.5 py-1.5 text-left text-[13px] transition-colors hover:border-accent/45"
      >
        <TypeIcon type={summary.type} size="xs" />
        <span className="min-w-0 truncate font-medium text-ink">
          {summary.name}
        </span>
      </button>
    </li>
  );
}

function ObjectList({ label, ids }: { label: string; ids: string[] }) {
  return (
    <section>
      <Caption as="h3">
        {label} ({ids.length})
      </Caption>
      {ids.length ? (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {ids.map((id) => (
            <ObjectButton key={id} id={id} />
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-subtle">None.</p>
      )}
    </section>
  );
}

/**
 * One log source's page: what it records, its columns, and the detections that use it. Its
 * heading takes focus when it opens (`headingRef`), so a keyboard or screen reader lands on it.
 */
export function LogSourcePage({
  source,
  headingRef,
}: {
  source: VisibilityLogSource;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const actions = useExplorerActions();
  return (
    <article
      className="flex flex-col gap-5"
      aria-label={`Log source ${source.name}`}
    >
      <button
        type="button"
        onClick={() => actions.openLogSource(null)}
        className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] text-subtle hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        all log sources
      </button>
      <header>
        <p className="font-mono text-[11px] text-subtle">{source.system}</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-0.5 break-all text-xl font-semibold tracking-[-0.01em] outline-none"
        >
          {source.name}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {source.description || "No description."}
        </p>
        {source.tenants.length ? (
          <p className="mt-1 font-mono text-[11px] text-subtle">
            tenants: {source.tenants.join(", ")}
          </p>
        ) : null}
      </header>
      <section>
        <Caption as="h3">Columns ({source.columns.length})</Caption>
        {source.columns.length ? (
          <div className="mt-2 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-band font-mono text-[11px] text-subtle">
                <tr>
                  <th className="px-3 py-1.5 font-medium">column</th>
                  <th className="px-3 py-1.5 font-medium">type</th>
                  <th className="px-3 py-1.5 font-medium">description</th>
                </tr>
              </thead>
              <tbody>
                {source.columns.map((column) => (
                  <tr key={column.name} className="border-t border-line">
                    <td className="px-3 py-1.5 font-mono text-ink">
                      {column.name}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-accent">
                      {column.type}
                    </td>
                    <td className="px-3 py-1.5 text-muted">
                      {column.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-subtle">
            <AlertTriangle className="size-3.5" aria-hidden />
            No columns declared: the column checks cannot run on this source.
          </p>
        )}
      </section>
      <ObjectList label="Rules whose queries read it" ids={source.read_by} />
      <ObjectList label="Rules through a signal" ids={source.signal_rules} />
      <ObjectList label="Objectives" ids={source.objectives} />
    </article>
  );
}

function SourceCard({ source }: { source: VisibilityLogSource }) {
  const actions = useExplorerActions();
  const unused = !source.rules.length && !source.objectives.length;
  return (
    <li>
      <button
        type="button"
        data-logsource={logSourceKey(source)}
        onClick={() => actions.openLogSource(logSourceKey(source))}
        className="flex h-full w-full flex-col gap-1.5 rounded-2xl border border-line bg-panel px-3.5 py-3 text-left transition-colors hover:border-accent/45"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-ink">
            {source.name}
          </span>
          <Tag className="shrink-0 px-1.5 text-[10px] leading-[14px]">
            {source.system}
          </Tag>
        </span>
        <span className="line-clamp-2 text-[12.5px] leading-snug text-muted">
          {source.description}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-subtle">
          <span className="inline-flex items-center gap-1">
            <Columns3 className="size-3" aria-hidden />
            {source.columns.length} columns
          </span>
          <span>{source.rules.length} rules</span>
          {!source.columns.length ? (
            <span className="text-warn">no columns</span>
          ) : null}
          {unused ? (
            <span className="inline-flex items-center gap-1 text-warn">
              <EyeOff className="size-3" aria-hidden />
              unused
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Datasets rules read that no log source declares, for the selected system. */
function Undeclared({ items }: { items: VisibilityUndeclared[] }) {
  return (
    <section aria-label="Read but not declared">
      <Caption as="h3">
        Read by rules, declared by no log source ({items.length})
      </Caption>
      {items.length ? (
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {items.map((item) => (
            <li
              key={`${item.system}:${item.name}`}
              className="rounded-2xl border border-dashed border-danger/50 bg-panel px-3.5 py-3"
            >
              <span className="flex items-center gap-2">
                <ShieldAlert
                  className="size-3.5 shrink-0 text-danger"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
                  {item.name}
                </span>
                <Tag className="px-1.5 text-[10px] leading-[14px]">
                  {item.system}
                </Tag>
              </span>
              {!item.system_declares ? (
                <p className="mt-1 text-[12px] text-subtle">
                  {item.system} declares no log source, so the query checks do
                  not warn.
                </p>
              ) : null}
              <ul className="mt-2 grid gap-1.5">
                {item.rules.map((id) => (
                  <ObjectButton key={id} id={id} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-subtle">None.</p>
      )}
    </section>
  );
}

/** Log sources a signal's `data.logsources` names that no log source declares. */
function UnknownSignalSources({
  items,
}: {
  items: VisibilityExport["unknown_signal_sources"];
}) {
  return (
    <section aria-label="Named by signals but not declared">
      <Caption as="h3">
        Named by signals, declared by no log source ({items.length})
      </Caption>
      <p className="mt-1 text-[12px] text-subtle">
        A signal&apos;s data.logsources names each; no log source of any system
        has that name.
      </p>
      <ul className="mt-2 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.name}
            className="rounded-2xl border border-dashed border-warn/50 bg-panel px-3.5 py-3"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle
                className="size-3.5 shrink-0 text-warn"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
                {item.name}
              </span>
            </span>
            <ul className="mt-2 grid gap-1.5">
              {item.objectives.map((id) => (
                <ObjectButton key={id} id={id} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What needs attention beyond the log sources: reads and signal names nothing declares. */
function NotDeclared({
  undeclared,
  unknown,
}: {
  undeclared: VisibilityUndeclared[];
  unknown: VisibilityExport["unknown_signal_sources"];
}) {
  return (
    <>
      <Undeclared items={undeclared} />
      {unknown.length ? <UnknownSignalSources items={unknown} /> : null}
    </>
  );
}

/**
 * The Visibility view: what telemetry the corpus declares and how its detections use it.
 * Only offered when the corpus exported `explorer.visibility.json`.
 */
export function VisibilityView() {
  const { visibility } = useCatalog();
  const open = useExplorer((s) => s.logSource);
  const [query, setQuery] = useState("");
  const [system, setSystem] = useState<string | null>(null);
  const [attention, setAttention] = useState<Attention>("all");
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const overview = useMemo(
    () => (visibility ? visibilityOverview(visibility) : null),
    [visibility],
  );
  const shown = useMemo(() => {
    if (!visibility) return [];
    return visibility.logsources.filter(
      (source) =>
        (!system || source.system === system) &&
        matchesLogSource(source, query) &&
        (attention === "all" ||
          (attention === "no-columns" && !source.columns.length) ||
          (attention === "unused" &&
            !source.rules.length &&
            !source.objectives.length)),
    );
  }, [visibility, system, query, attention]);
  const undeclared = useMemo(
    () =>
      (visibility?.undeclared ?? []).filter(
        (item) => !system || item.system === system,
      ),
    [visibility, system],
  );

  const page = visibility && open ? findLogSource(visibility, open) : undefined;
  const pageKey = page ? logSourceKey(page) : null;

  // Opening a page puts it at the top and moves focus to its heading; leaving it gives focus
  // back to the card it was opened from.
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    const left = shownKey.current;
    shownKey.current = pageKey;
    if (pageKey === left) return;
    const container = scroller.current;
    if (pageKey) {
      if (container) container.scrollTop = 0;
      heading.current?.focus({ preventScroll: true });
    } else if (left && container) {
      const card = [
        ...container.querySelectorAll<HTMLElement>("[data-logsource]"),
      ].find((element) => element.dataset.logsource === left);
      card?.focus();
    }
  }, [pageKey]);

  if (!visibility || !overview) return null;
  const unknown = visibility.unknown_signal_sources;

  return (
    <div
      ref={scroller}
      className="h-full overflow-y-auto px-4 pb-10 pt-2 sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent">
            <Radar className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">
              Visibility
            </h2>
            <p className="text-[13px] text-muted">
              The telemetry this library declares, and the detections that use
              it.
            </p>
          </div>
          <TlpBadge tlp={visibility.tlp} />
        </header>
        {visibility.problem ? (
          <p className="rounded-xl border border-line bg-panel px-3 py-2 text-[13px] text-muted">
            {visibility.problem}
          </p>
        ) : null}
        {visibility.reads_unavailable ? (
          <p className="rounded-xl border border-line bg-panel px-3 py-2 text-[13px] text-muted">
            The datasets rules read are not known:{" "}
            {visibility.reads_unavailable}
          </p>
        ) : null}

        {!visibility.present ? (
          <>
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-[13px] text-muted">
              This library declares no log sources (
              <code className="font-mono text-[12px]">
                .opentide/configurations/visibility.toml
              </code>
              ).
            </p>
            {visibility.undeclared.length ? (
              <Undeclared items={visibility.undeclared} />
            ) : null}
            {unknown.length ? <UnknownSignalSources items={unknown} /> : null}
          </>
        ) : page ? (
          <LogSourcePage source={page} headingRef={heading} />
        ) : (
          <>
            <section
              aria-label="Overview"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Tile
                value={overview.logsources}
                label="log sources"
                detail={`${overview.withColumns} with columns · ${overview.used} used`}
                pressed={attention === "all"}
                onClick={() => setAttention("all")}
              />
              <Tile
                value={overview.withoutColumns}
                label="without columns"
                detail="column checks cannot run"
                tone="warn"
                pressed={attention === "no-columns"}
                onClick={() => setAttention("no-columns")}
              />
              <Tile
                value={overview.unused}
                label="used by no detection"
                tone="warn"
                pressed={attention === "unused"}
                onClick={() => setAttention("unused")}
              />
              <Tile
                value={overview.undeclared}
                label="read but not declared"
                detail={
                  unknown.length
                    ? `${unknown.length} more named by signals`
                    : undefined
                }
                tone="danger"
                pressed={attention === "undeclared"}
                onClick={() => setAttention("undeclared")}
              />
            </section>

            <section aria-label="Systems" className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={system === null}
                onClick={() => setSystem(null)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 font-mono text-[11px]",
                  system === null
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-line text-muted hover:text-ink",
                )}
              >
                all systems
              </button>
              {overview.systems.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  aria-pressed={system === row.name}
                  onClick={() =>
                    setSystem(system === row.name ? null : row.name)
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 font-mono text-[11px]",
                    system === row.name
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-line text-muted hover:text-ink",
                  )}
                  title={`${row.withColumns} with columns · ${row.used} used`}
                >
                  {row.name} {row.logsources}
                </button>
              ))}
            </section>

            {attention === "undeclared" ? (
              <NotDeclared undeclared={undeclared} unknown={unknown} />
            ) : (
              <section aria-label="Log sources" className="flex flex-col gap-3">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search log sources by name or description"
                  aria-label="Search log sources"
                  className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
                {shown.length ? (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shown.map((source) => (
                      <SourceCard key={logSourceKey(source)} source={source} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-subtle">
                    No log source matches.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
