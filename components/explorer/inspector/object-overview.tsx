"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowUpRight, CornerDownRight } from "lucide-react";
import {
  useCatalog,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { VocabChip } from "@/components/explorer/inspector/vocab-chip";
import { CodePanel } from "@/components/code/code-panel";
import { Markdown } from "@/components/ui/markdown";
import { Caption, Tag, TypeIcon } from "@/components/ui/tide";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { techniqueName, techniqueUrl } from "@/lib/explorer/catalog";
import {
  fieldGroups,
  objectDescription,
  ownTechniques,
} from "@/lib/explorer/fields";
import { resolveObjectTechniques } from "@/lib/graph/attack-mapping";
import { parents } from "@/lib/opentide/graph";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";
import {
  flattenReferences,
  normalizeReference,
  splitPillValues,
} from "@/lib/opentide/vocab";

export function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="tide-fade-slide">
      <div className="mb-2.5 flex items-center gap-2">
        <Caption as="h3">{label}</Caption>
        <span aria-hidden className="h-px flex-1 bg-line" />
        {aside ? (
          <span className="font-mono text-[11px] text-subtle">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Techniques({ ids, inherited }: { ids: string[]; inherited?: string }) {
  const { vocab } = useCatalog();
  const actions = useExplorerActions();
  return (
    <Section
      label="att&ck"
      aside={inherited ? `via ${inherited}` : `${ids.length}`}
    >
      <ul className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const name = techniqueName(vocab, id);
          return (
            <li key={id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => actions.toggleToken("technique", id)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-panel py-1 pl-1.5 pr-2 text-left transition-colors hover:border-accent/45"
                  >
                    <span className="rounded bg-accent/10 px-1 font-mono text-[10.5px] text-accent">
                      {id}
                    </span>
                    {name !== id ? (
                      <span className="truncate text-[12px] text-muted">
                        {name}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  Filter the library by {id}
                  <a
                    href={techniqueUrl(id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center gap-0.5 text-accent underline-offset-2 hover:underline"
                  >
                    MITRE <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Facts({
  facts,
}: {
  facts: Array<{ label: string; node: ReactNode }>;
}) {
  if (!facts.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0 bg-panel px-3 py-2">
          <dt className="font-mono text-[10.5px] text-subtle">
            {fact.label.toLowerCase()}
          </dt>
          <dd className="mt-0.5 truncate text-[13px] font-medium text-ink">
            {fact.node}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function References({ value }: { value: unknown }) {
  const refs = flattenReferences(value)
    .map((ref) => normalizeReference(ref))
    .filter((ref): ref is NonNullable<typeof ref> => ref != null);
  if (!refs.length) return null;
  return (
    <Section label="references" aside={String(refs.length)}>
      <ol className="space-y-1">
        {refs.map((ref, i) => {
          let host = ref.url;
          try {
            host = new URL(ref.url).hostname.replace(/^www\./, "");
          } catch {
            // Not a URL: show it as written.
          }
          return (
            <li key={`${ref.url}-${i}`}>
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-baseline gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-hover"
              >
                <span className="w-4 shrink-0 text-right font-mono text-[10.5px] text-subtle">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink group-hover:text-accent">
                    {ref.label === ref.url ? host : ref.label}
                  </span>
                  {ref.label === ref.url ? (
                    <span className="block truncate font-mono text-[10.5px] text-subtle">
                      {ref.url.replace(/^https?:\/\//, "")}
                    </span>
                  ) : null}
                </span>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-subtle"
                  aria-hidden
                />
              </a>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function statusTone(status: string): "solid" | "accent" | "outline" {
  const s = status.toUpperCase();
  if (s === "PRODUCTION") return "solid";
  if (s === "STAGING") return "accent";
  return "outline";
}

/** A rule's integrations: each configuration, its status, and its query. */
function Integrations({ body }: { body: ObjectBody }) {
  const configurations =
    (body["configurations"] as Record<string, ObjectBody> | undefined) ?? {};
  const entries = Object.entries(configurations);
  if (!entries.length) return null;
  return (
    <Section label="integrations" aside={String(entries.length)}>
      <div className="space-y-3">
        {entries.map(([platform, config]) => {
          const status =
            typeof config?.["status"] === "string"
              ? (config["status"] as string)
              : null;
          const query =
            typeof config?.["query"] === "string"
              ? (config["query"] as string)
              : null;
          const extras = Object.entries(config ?? {}).filter(
            ([key, value]) =>
              !["status", "query", "contributors"].includes(key) &&
              (typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"),
          );
          return (
            <div key={platform} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  {platform.replace(/_/g, " ")}
                </span>
                {status ? (
                  <Tag tone={statusTone(status)}>{status.toLowerCase()}</Tag>
                ) : null}
              </div>
              {extras.length ? (
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-subtle">
                  {extras.slice(0, 6).map(([key, value]) => (
                    <span key={key}>
                      {key}: <span className="text-muted">{String(value)}</span>
                    </span>
                  ))}
                </p>
              ) : null}
              {query ? (
                <CodePanel
                  code={query.trim()}
                  language="query"
                  caption={`${platform} · query`}
                  maxHeight="22rem"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Examples({ examples }: { examples: unknown }) {
  if (!Array.isArray(examples) || !examples.length) return null;
  return (
    <Section label="examples" aside={String(examples.length)}>
      <div className="space-y-3">
        {examples.map((raw, index) => {
          if (!raw || typeof raw !== "object") return null;
          const example = raw as ObjectBody;
          const description =
            typeof example["description"] === "string"
              ? example["description"]
              : null;
          const query =
            typeof example["query"] === "string" ? example["query"] : null;
          const language =
            typeof example["language"] === "string"
              ? example["language"]
              : "query";
          const link =
            typeof example["link"] === "string" ? example["link"] : null;
          return (
            <div key={`${language}-${index}`} className="space-y-2">
              {description ? <Markdown>{description}</Markdown> : null}
              {query ? (
                <CodePanel
                  code={query.trim()}
                  language="query"
                  caption={language}
                  maxHeight="18rem"
                  aside={
                    link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-code-dim transition-colors hover:text-code-ink"
                      >
                        source <ArrowUpRight className="size-3" aria-hidden />
                      </a>
                    ) : null
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** A signal's objective, or an objective's signals, as compact rows. */
function RelatedRows({ label, ids }: { label: string; ids: string[] }) {
  const { summaries, bundle } = useCatalog();
  const actions = useExplorerActions();
  if (!ids.length) return null;
  return (
    <Section label={label} aside={String(ids.length)}>
      <ul className="space-y-1">
        {ids.map((id) => {
          const summary = summaries.get(id);
          if (!summary) return null;
          const severity = bundle.flatIndex[id]?.["severity"];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => actions.select(id)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-accent/45"
              >
                <TypeIcon type={summary.type} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                  {summary.name}
                </span>
                {typeof severity === "string" ? (
                  <Tag>{severity.toLowerCase()}</Tag>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The object, field by field: description, ATT&CK, the taxonomy values, what it runs as. */
export function ObjectOverview({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const catalog = useCatalog();
  const groups = useMemo(() => fieldGroups(summary, body), [summary, body]);
  const description = objectDescription(body);

  const own = ownTechniques(summary, body);
  const resolved = useMemo(
    () => (own.length ? own : resolveObjectTechniques(catalog.graph, summary)),
    [own, catalog.graph, summary],
  );
  const inheritedFrom =
    own.length || !resolved.length
      ? undefined
      : summary.type === "objective"
        ? "its threats"
        : "its objective";

  const threat =
    summary.type === "threat"
      ? (body["threat"] as ObjectBody | undefined)
      : undefined;
  const surface = threat ? splitPillValues(threat["surface"]) : [];
  const terrain =
    typeof threat?.["terrain"] === "string"
      ? (threat["terrain"] as string)
      : null;
  const actors = summary.type === "threat" ? summary.actors : [];

  const objectiveSignals =
    summary.type === "objective"
      ? (
          ((body["objective"] as ObjectBody | undefined)?.["signals"] as
            | ObjectBody[]
            | undefined) ?? []
        )
          .map((signal) => signal?.["uuid"])
          .filter((uuid): uuid is string => typeof uuid === "string")
      : [];
  const parentObjectives =
    summary.type === "signal"
      ? parents(catalog.graph, summary.uuid).filter(
          (id) => catalog.summaries.get(id)?.type === "objective",
        )
      : [];

  const facts = groups.facts.map((entry) => ({
    label: entry.field.label,
    node: entry.field.vocab ? (
      <VocabFact value={entry.values[0]!} vocab={entry.field.vocab} />
    ) : (
      entry.values[0]
    ),
  }));

  return (
    <div className="space-y-6">
      {parentObjectives.length ? (
        <RelatedRows label="part of" ids={parentObjectives} />
      ) : null}

      {description ? (
        <section className="tide-fade-slide">
          <Markdown className="text-[13.5px] leading-relaxed">
            {description}
          </Markdown>
        </section>
      ) : (
        <p className="text-sm text-subtle">No description.</p>
      )}

      <Facts facts={facts} />

      {resolved.length ? (
        <Techniques ids={resolved} inherited={inheritedFrom} />
      ) : null}

      {surface.length ? (
        <Section label="surface" aside={String(surface.length)}>
          <div className="flex flex-wrap gap-1.5">
            {surface.map((value) => (
              <VocabChip
                key={value}
                value={value}
                vocab="surface"
                tone="accent"
              />
            ))}
          </div>
        </Section>
      ) : null}

      {actors.length ? (
        <Section label="threat actors" aside={String(actors.length)}>
          <div className="flex flex-wrap gap-1.5">
            {actors.map((actor) => (
              <VocabChip key={actor} value={actor} vocab="actors" />
            ))}
          </div>
        </Section>
      ) : null}

      {groups.lists.map((entry) => (
        <Section
          key={entry.field.path}
          label={entry.field.label.toLowerCase()}
          aside={String(entry.values.length)}
        >
          <div className="flex flex-wrap gap-1.5">
            {entry.values.map((value) => (
              <VocabChip key={value} value={value} vocab={entry.field.vocab} />
            ))}
          </div>
        </Section>
      ))}

      {terrain ? (
        <Section label="terrain">
          <Markdown>{terrain}</Markdown>
        </Section>
      ) : null}

      {objectiveSignals.length ? (
        <RelatedRows label="signals" ids={objectiveSignals} />
      ) : null}

      {summary.type === "rule" ? <Integrations body={body} /> : null}
      {summary.type === "signal" ? (
        <Examples examples={body["examples"]} />
      ) : null}

      {groups.prose.map((entry) => (
        <Section key={entry.field.path} label={entry.field.label.toLowerCase()}>
          <Markdown>{String(entry.value)}</Markdown>
        </Section>
      ))}

      <References value={body["references"]} />
      <Provenance summary={summary} body={body} />
    </div>
  );
}

function VocabFact({ value, vocab }: { value: string; vocab: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="truncate">{value.split("::").pop()}</span>
      <span className="sr-only"> ({vocab})</span>
    </span>
  );
}

function Provenance({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const metadata = (body["metadata"] as ObjectBody | undefined) ?? {};
  const organisation = (metadata["organisation"] as ObjectBody | undefined)?.[
    "name"
  ];
  const contributors = Array.isArray(metadata["contributors"])
    ? (metadata["contributors"] as unknown[]).filter(
        (c): c is string => typeof c === "string",
      )
    : [];
  const rows = [
    ["created", metadata["created"]],
    ["modified", metadata["modified"]],
    ["author", metadata["author"]],
    ["organisation", organisation],
    ["contributors", contributors.join(", ") || null],
  ].filter(([, value]) => typeof value === "string" && value);

  if (!rows.length && !summary.schema) return null;
  return (
    <Section label="provenance">
      <dl className="space-y-1 font-mono text-[11px]">
        {rows.map(([key, value]) => (
          <div key={String(key)} className="flex gap-3">
            <dt className="w-24 shrink-0 text-subtle">{String(key)}</dt>
            <dd className="min-w-0 break-words text-muted">{String(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-subtle">
        <CornerDownRight className="size-3" aria-hidden />
        schema {summary.schema ?? `${summary.type}::1.0`}
      </p>
    </Section>
  );
}
