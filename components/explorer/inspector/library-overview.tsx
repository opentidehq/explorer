"use client";

import { ArrowRight } from "lucide-react";
import {
  useCatalog,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { Section } from "@/components/explorer/inspector/object-overview";
import { Kbd, TypeIcon } from "@/components/ui/tide";
import { TYPE_PLURALS } from "@/lib/graph/type-icons";
import { OBJECT_TYPES } from "@/lib/opentide/types";

function Meter({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  const share = total ? value / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-muted">
          <span className="text-xl font-bold tracking-[-0.02em] text-ink">
            {value}
          </span>
          <span className="text-subtle"> / {total}</span> {label}
        </p>
        <span className="font-mono text-[11px] text-accent">
          {Math.round(share * 100)}%
        </span>
      </div>
      <span
        aria-hidden
        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink/6"
      >
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${Math.max(share * 100, value ? 2 : 0)}%` }}
        />
      </span>
    </div>
  );
}

/**
 * What the inspector shows with nothing selected: what is in the library, how much of it is
 * detected, where it runs, and where to start.
 */
export function LibraryOverview() {
  const catalog = useCatalog();
  const actions = useExplorerActions();
  const { overview, bundle } = catalog;
  const repo = bundle.source?.repository.replace(
    /^https?:\/\/(www\.)?github\.com\//,
    "",
  );

  return (
    <div className="tide-scroll h-full overflow-y-auto px-5 py-5">
      <p className="font-mono text-[11px] text-subtle">
        {repo ?? "local corpus"}
      </p>
      <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-ink">
        opentide library
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted text-pretty">
        Threats, the objectives that detect them, their signals and the rules
        that implement them, linked by UUID and described in versioned
        vocabularies.
      </p>

      <ul className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {OBJECT_TYPES.map((type) => (
          <li key={type} className="bg-panel">
            <button
              type="button"
              onClick={() => actions.toggleToken("type", type)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-hover"
            >
              <TypeIcon type={type} size="md" />
              <span>
                <span className="block text-lg font-bold leading-none tracking-[-0.02em] text-ink">
                  {overview.counts[type]}
                </span>
                <span className="font-mono text-[11px] text-subtle">
                  {TYPE_PLURALS[type]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-7 space-y-7">
        <Section label="detection coverage">
          <div className="space-y-4">
            <Meter
              value={overview.coveredThreats}
              total={overview.counts.threat}
              label="threats have an objective"
            />
            <Meter
              value={overview.threatsWithRules}
              total={overview.counts.threat}
              label="reach a rule"
            />
            <Meter
              value={overview.techniques.detected}
              total={Math.max(
                overview.techniques.mapped,
                overview.techniques.detected,
              )}
              label="att&ck techniques detected"
            />
          </div>
          <button
            type="button"
            onClick={() => actions.setView("attack")}
            className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
          >
            open the att&amp;ck matrix{" "}
            <ArrowRight className="size-3" aria-hidden />
          </button>
        </Section>

        <Section label="detection chain">
          <ol className="flex items-stretch gap-1.5">
            {OBJECT_TYPES.map((type, i) => (
              <li
                key={type}
                className="flex min-w-0 flex-1 items-center gap-1.5"
              >
                <span className="flex min-w-0 flex-1 flex-col items-center rounded-xl border border-line px-1 py-2">
                  <TypeIcon type={type} size="xs" />
                  <span className="mt-1 text-[13px] font-semibold text-ink">
                    {overview.counts[type]}
                  </span>
                  <span className="truncate font-mono text-[10px] text-subtle">
                    {TYPE_PLURALS[type]}
                  </span>
                </span>
                {i < OBJECT_TYPES.length - 1 ? (
                  <ArrowRight
                    aria-hidden
                    className="size-3 shrink-0 text-subtle"
                  />
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-subtle">
            {overview.chainingLinks} chaining links connect threats into attack
            paths.
          </p>
        </Section>

        {overview.platforms.length ? (
          <Section
            label="integrations"
            aside={String(overview.platforms.length)}
          >
            <ul className="space-y-1">
              {overview.platforms.map((platform) => (
                <li key={platform.name}>
                  <button
                    type="button"
                    onClick={() =>
                      actions.toggleToken(
                        "platform",
                        platform.name.replace(/_/g, " "),
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {platform.name.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-[11px] text-subtle">
                      {platform.rules} rule{platform.rules === 1 ? "" : "s"}
                      {platform.production
                        ? ` · ${platform.production} in production`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {overview.mostChained.length ? (
          <Section label="most chained threats">
            <ul className="space-y-1">
              {overview.mostChained.map((threat) => (
                <li key={threat.id}>
                  <button
                    type="button"
                    onClick={() => actions.select(threat.id)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 text-left transition-colors hover:border-accent/45"
                  >
                    <TypeIcon type="threat" size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                      {threat.name}
                    </span>
                    <span className="font-mono text-[11px] text-subtle">
                      {threat.degree}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {overview.killchain.length ? (
          <Section label="kill chain">
            <ul className="space-y-1.5">
              {overview.killchain.slice(0, 8).map(({ stage, count }) => (
                <li
                  key={stage}
                  className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3"
                >
                  <span className="truncate text-[12.5px] text-muted">
                    {stage}
                  </span>
                  <span
                    aria-hidden
                    className="h-1.5 overflow-hidden rounded-full bg-ink/6"
                  >
                    <span
                      className="block h-full rounded-full bg-threat"
                      style={{
                        width: `${(count / (overview.killchain[0]?.count || 1)) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="font-mono text-[11px] text-subtle">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section label="keys">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted">
            <div className="flex items-center gap-2">
              <dt>
                <Kbd>⌘K</Kbd>
              </dt>
              <dd>jump to an object</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt>
                <Kbd>/</Kbd>
              </dt>
              <dd>search</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt>
                <Kbd>1</Kbd>
                <Kbd className="ml-0.5">2</Kbd>
                <Kbd className="ml-0.5">3</Kbd>
              </dt>
              <dd>switch views</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt>
                <Kbd>esc</Kbd>
              </dt>
              <dd>clear selection</dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
