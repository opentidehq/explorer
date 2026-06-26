"use client";

import {
  Biohazard,
  Crosshair,
  ExternalLink,
  Focus,
  Radio,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { YamlPanel } from "@/components/code/yaml-panel";
import { QueryViewer } from "@/components/code/query-viewer";
import { useExplorer } from "@/components/shell/explorer-context";
import { relationsList } from "@/lib/opentide/graph";
import type {
  BundleObjectSummary,
  ObjectBody,
  ObjectType,
} from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

interface ObjectDetailPanelProps {
  summary: BundleObjectSummary;
  body: ObjectBody;
  onClose: () => void;
}

const TYPE_ICONS = {
  threat: Biohazard,
  objective: Crosshair,
  signal: Radio,
  rule: Focus,
} as const;

export function ObjectDetailPanel({
  summary,
  body,
  onClose,
}: ObjectDetailPanelProps) {
  const { graphContext, setSelectedId, getSummary, bundle } = useExplorer();
  const relations = relationsList(
    graphContext,
    summary.uuid,
    "flat",
    "both",
  ) as Record<string, string[]>;
  const Icon = TYPE_ICONS[summary.type];
  const staging = bundle.stagingIndex?.deployments[summary.uuid];

  return (
    <aside
      className={cn(
        "absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col",
        "border-l border-border bg-card/95 shadow-2xl backdrop-blur-md",
        "animate-in slide-in-from-right duration-200",
      )}
      role="dialog"
      aria-label={`${summary.name} details`}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            summary.type === "threat" &&
              "border-threat/30 bg-threat/10 text-threat",
            summary.type === "objective" &&
              "border-objective/30 bg-objective/10 text-objective",
            summary.type === "signal" &&
              "border-signal/30 bg-signal/10 text-signal",
            summary.type === "rule" && "border-rule/30 bg-rule/10 text-rule",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={summary.type}>{summary.type}</Badge>
            {summary.status && (
              <Badge variant="outline">{summary.status}</Badge>
            )}
          </div>
          <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight">
            {summary.name}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {summary.uuid}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => {
            setSelectedId(null);
            onClose();
          }}
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <MetaSection summary={summary} staging={staging} />

          <ThreatSections body={body} type={summary.type} />
          <ObjectiveSections body={body} type={summary.type} />
          <RuleSections body={body} type={summary.type} />

          {summary.techniques.length > 0 && (
            <section>
              <SectionHeading>ATT&CK techniques</SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {summary.techniques.map((t) => (
                  <a
                    key={t}
                    href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-primary hover:bg-muted"
                  >
                    {t}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {summary.actors.length > 0 && (
            <section>
              <SectionHeading>Threat actors</SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {summary.actors.map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="font-mono text-[11px]"
                  >
                    {a}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading>Relations</SectionHeading>
            {Object.entries(relations).map(([type, ids]) => (
              <div key={type} className="mb-3">
                <p className="mb-1 text-xs font-medium capitalize text-muted-foreground">
                  {type}
                </p>
                <ul className="space-y-1">
                  {ids.slice(0, 8).map((id) => {
                    const rel = getSummary(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                          onClick={() => setSelectedId(id)}
                        >
                          <RelationIcon type={type as ObjectType} />
                          <span className="truncate font-medium">
                            {rel?.name ?? id.slice(0, 8)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          {summary.type === "rule" && (
            <section>
              <SectionHeading>Platform queries</SectionHeading>
              <PlatformQueries body={body} />
            </section>
          )}

          <section>
            <SectionHeading>Source YAML</SectionHeading>
            <YamlPanel data={body} />
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function MetaSection({
  summary,
  staging,
}: {
  summary: BundleObjectSummary;
  staging?: Record<string, string>;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
      {summary.schema && (
        <div>
          <dt className="text-muted-foreground">Schema</dt>
          <dd className="mt-0.5 font-mono">{summary.schema}</dd>
        </div>
      )}
      {summary.tlp && (
        <div>
          <dt className="text-muted-foreground">TLP</dt>
          <dd className="mt-0.5">{summary.tlp}</dd>
        </div>
      )}
      <div>
        <dt className="text-muted-foreground">Platforms</dt>
        <dd className="mt-0.5">{summary.platforms.join(", ") || "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Relations</dt>
        <dd className="mt-0.5">{summary.relatedCount}</dd>
      </div>
      {staging && (
        <div className="col-span-2">
          <dt className="text-muted-foreground">Deployments</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {Object.entries(staging).map(([platform, status]) => (
              <Badge
                key={platform}
                variant="outline"
                className="font-mono text-[10px]"
              >
                {platform.replace(/_/g, " ")}: {status}
              </Badge>
            ))}
          </dd>
        </div>
      )}
    </section>
  );
}

function RelationIcon({ type }: { type: ObjectType }) {
  const Icon = TYPE_ICONS[type] ?? Crosshair;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function ThreatSections({ body, type }: { body: ObjectBody; type: string }) {
  if (type !== "threat") return null;
  const threat = body["threat"] as ObjectBody | undefined;
  if (!threat) return null;

  const fields: Array<[string, string | number | undefined]> = [
    ["Severity", threat["severity"] as string | undefined],
    ["Impact", threat["impact"] as string | undefined],
    ["Leverage", threat["leverage"] as string | undefined],
    ["Viability", threat["viability"] as string | undefined],
    ["Kill chain", threat["killchain"] as string | undefined],
    ["Terrain", threat["terrain"] as string | undefined],
  ];

  const visible = fields.filter(([, v]) => v);
  if (!visible.length) return null;

  return (
    <section>
      <SectionHeading>Threat assessment</SectionHeading>
      <dl className="space-y-3 rounded-lg border border-border p-3 text-sm">
        {visible.map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs font-medium text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed">
              {String(value).slice(0, 800)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ObjectiveSections({ body, type }: { body: ObjectBody; type: string }) {
  if (type !== "objective") return null;
  const objective = body["objective"] as ObjectBody | undefined;
  const signals = objective?.["signals"] as Array<ObjectBody> | undefined;
  if (!signals?.length) return null;

  return (
    <section>
      <SectionHeading>Embedded signals ({signals.length})</SectionHeading>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li
            key={String(s["uuid"])}
            className="rounded-lg border border-border bg-muted/20 p-3 text-sm"
          >
            <p className="font-medium">{String(s["name"] ?? "Signal")}</p>
            {Boolean(s["description"]) && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {String(s["description"]).slice(0, 300)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuleSections({ body, type }: { body: ObjectBody; type: string }) {
  if (type !== "rule") return null;
  const description = body["description"];
  if (!description) return null;
  return (
    <section>
      <SectionHeading>Description</SectionHeading>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {String(description)}
      </p>
    </section>
  );
}

function PlatformQueries({ body }: { body: ObjectBody }) {
  const configs = body["configurations"] as
    | Record<string, ObjectBody>
    | undefined;
  if (!configs) return null;

  const platforms = Object.keys(configs);
  if (!platforms.length) return null;

  return (
    <div className="space-y-4">
      {platforms.map((p) => {
        const query = configs[p]?.["query"];
        const status = String(configs[p]?.["status"] ?? "");
        return (
          <div key={p}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">
                {p.replace(/_/g, " ")}
              </span>
              {status && <Badge variant="outline">{status}</Badge>}
            </div>
            {typeof query === "string" ? (
              <QueryViewer platform={p} query={query} />
            ) : (
              <p className="text-xs text-muted-foreground">
                No query configured.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
