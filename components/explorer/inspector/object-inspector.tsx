"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import {
  useCatalog,
  useExplorer,
  useExplorerActions,
  type InspectorTab,
} from "@/components/explorer/explorer-state";
import { ObjectFile } from "@/components/explorer/inspector/object-file";
import { ObjectLinks } from "@/components/explorer/inspector/object-links";
import { ObjectOverview } from "@/components/explorer/inspector/object-overview";
import { Segmented, Tag, TypeIcon } from "@/components/ui/tide";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { firstString } from "@/lib/explorer/fields";
import { linkCount, linkGroups } from "@/lib/explorer/links";
import { getThreatKillchain } from "@/lib/graph/killchain-grouping";
import { TYPE_PLURALS, TYPE_QUESTIONS } from "@/lib/graph/type-icons";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text) => {
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {});
    },
  ];
}

function permalink(summary: BundleObjectSummary): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${window.location.origin}${base}/${TYPE_PLURALS[summary.type]}/${summary.uuid}/`;
}

/** The two or three facts that place an object at a glance. */
function headlineTags(summary: BundleObjectSummary, body: ObjectBody) {
  const tags: Array<{ text: string; tone: "solid" | "accent" | "outline" }> =
    [];
  if (summary.type === "threat") {
    const threat = body["threat"] as ObjectBody | undefined;
    const stage = getThreatKillchain(body);
    if (stage) tags.push({ text: stage.toLowerCase(), tone: "accent" });
    const severity = firstString(threat, "severity");
    if (severity) tags.push({ text: severity.toLowerCase(), tone: "outline" });
    const criticality = firstString(body, "criticality");
    if (criticality)
      tags.push({
        text: `criticality ${criticality.toLowerCase()}`,
        tone: "outline",
      });
  } else if (summary.type === "objective") {
    const objective = body["objective"] as ObjectBody | undefined;
    const priority = firstString(objective, "priority");
    if (priority)
      tags.push({ text: `${priority.toLowerCase()} priority`, tone: "accent" });
    const strategy = firstString(
      objective?.["composition"] as ObjectBody | undefined,
      "strategy",
    );
    if (strategy) tags.push({ text: strategy.toLowerCase(), tone: "outline" });
  } else if (summary.type === "signal") {
    const severity = firstString(body, "severity");
    if (severity) tags.push({ text: severity.toLowerCase(), tone: "accent" });
    const effort = firstString(body, "effort");
    if (effort)
      tags.push({ text: `effort ${effort.toLowerCase()}`, tone: "outline" });
  } else if (summary.type === "rule") {
    if (summary.status) {
      tags.push({
        text: summary.status.toLowerCase(),
        tone: summary.status === "PRODUCTION" ? "solid" : "accent",
      });
    }
    for (const platform of summary.platforms.slice(0, 3)) {
      tags.push({ text: platform, tone: "outline" });
    }
  }
  return tags;
}

export function ObjectInspector({
  summary,
  onClose,
}: {
  summary: BundleObjectSummary;
  onClose: () => void;
}) {
  const catalog = useCatalog();
  const actions = useExplorerActions();
  const tab = useExplorer((s) => s.inspectorTab);
  const body = catalog.bundle.flatIndex[summary.uuid] ?? {};
  const [copiedUuid, copyUuid] = useCopy();
  const [copiedLink, copyLink] = useCopy();

  const links = useMemo(
    () => linkCount(linkGroups(catalog, summary.uuid)),
    [catalog, summary.uuid],
  );
  const tags = headlineTags(summary, body);
  const metadata = (body["metadata"] as ObjectBody | undefined) ?? {};
  const version = metadata["version"];
  const tlp =
    summary.tlp ??
    (typeof metadata["tlp"] === "string" ? metadata["tlp"] : undefined);

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label={summary.name}>
      <header className="shrink-0 border-b border-line px-5 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <TypeIcon type={summary.type} size="lg" active />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-subtle">
              <span className="text-accent">
                {summary.schema ?? `${summary.type}::1.0`}
              </span>
              {version != null ? <span>· v{String(version)}</span> : null}
              {tlp ? (
                <span>· tlp:{tlp.toLowerCase().replace(/^tlp:/, "")}</span>
              ) : null}
            </p>
            <h2 className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-balance text-ink">
              {summary.name}
            </h2>
          </div>
          <div className="-mr-1.5 -mt-0.5 flex shrink-0 items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Copy link"
                  onClick={() => copyLink(permalink(summary))}
                  className="tide-pill-icon size-8"
                >
                  {copiedLink ? (
                    <Check className="size-4 text-accent" />
                  ) : (
                    <Link2 className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {copiedLink ? "Link copied" : "Copy a link to this object"}
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="tide-pill-icon size-8"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-subtle">
          {TYPE_QUESTIONS[summary.type]}
        </p>
        {tags.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Tag key={tag.text} tone={tag.tone}>
                {tag.text}
              </Tag>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <Segmented<InspectorTab>
            size="sm"
            label="Object details"
            value={tab}
            onChange={actions.setInspectorTab}
            options={[
              { value: "overview", label: "overview" },
              { value: "links", label: `links · ${links}` },
              { value: "file", label: "file" },
            ]}
          />
          <button
            type="button"
            onClick={() => copyUuid(summary.uuid)}
            className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10.5px] text-subtle transition-colors hover:bg-hover hover:text-ink"
            title="Copy UUID"
          >
            <span className="truncate">{summary.uuid.slice(0, 8)}…</span>
            {copiedUuid ? (
              <Check className="size-3 text-accent" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </div>
      </header>

      <div
        key={`${summary.uuid}-${tab}`}
        className="tide-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        {tab === "overview" ? (
          <ObjectOverview summary={summary} body={body} />
        ) : null}
        {tab === "links" ? <ObjectLinks id={summary.uuid} /> : null}
        {tab === "file" ? <ObjectFile summary={summary} body={body} /> : null}
      </div>
    </article>
  );
}
