"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  GitBranch,
  Link2,
  ScanSearch,
  Server,
  Zap,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { VocabTooltip } from "@/components/ui/vocab-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryViewer } from "@/components/code/query-viewer";
import { SchemaAssessment } from "@/components/objects/assessment-renderer";
import { MetadataSection } from "@/components/objects/metadata-section";
import { PanelSectionHeader } from "@/components/objects/panel-section-header";
import { EXPLORER_BAR_HEIGHT_CLASS } from "@/components/shell/explorer-chrome";
import { ThreatChainModal } from "@/components/objects/threat-chain-modal";
import { useExplorer } from "@/components/shell/explorer-context";
import { buildThreatChainTree } from "@/lib/graph/threat-chain";
import {
  TYPE_ICONS,
  TYPE_LABELS,
  TYPE_TEXT_CLASS,
  typeIconBadgeClass,
} from "@/lib/graph/type-icons";
import {
  chainsTabData,
  chainingLinkRowKey,
  relationsList,
} from "@/lib/opentide/graph";
import { lookupChainingRelation } from "@/lib/opentide/vocab";
import type {
  BundleObjectSummary,
  ObjectBody,
  ObjectType,
} from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

const YamlPanel = dynamic(
  () =>
    import("@/components/code/yaml-panel").then((m) => ({
      default: m.YamlPanel,
    })),
  {
    loading: () => (
      <div className="py-8 text-xs text-muted-foreground">Loading YAML…</div>
    ),
  },
);

interface ObjectPanelProps {
  summary: BundleObjectSummary;
  body: ObjectBody;
}

export function PanelEmptyState({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center text-muted-foreground",
        compact && EXPLORER_BAR_HEIGHT_CLASS,
        compact ? "px-5" : "h-full p-5",
      )}
    >
      <p className={cn("text-sm", compact && "text-xs")}>{message}</p>
    </div>
  );
}

export function ObjectTitleBar({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const Icon = TYPE_ICONS[summary.type];
  const { graphContext } = useExplorer();
  const [copied, setCopied] = useState(false);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [chainOpen, setChainOpen] = useState(false);

  const hasThreatChain = useMemo(() => {
    if (summary.type !== "threat") return false;
    return buildThreatChainTree(graphContext, summary.uuid) != null;
  }, [graphContext, summary.type, summary.uuid]);

  const copyUuid = async () => {
    await navigator.clipboard.writeText(summary.uuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <header
        className="relative flex w-full items-center gap-4"
        role="dialog"
        aria-label={`${summary.name} details`}
      >
        <div className={typeIconBadgeClass(summary.type, "lg")}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.2em]",
              TYPE_TEXT_CLASS[summary.type],
            )}
          >
            {TYPE_LABELS[summary.type]}
          </p>
          <h2 className="truncate text-base font-semibold leading-snug tracking-tight">
            {summary.name}
          </h2>
          <button
            type="button"
            onClick={copyUuid}
            className="mt-0.5 flex max-w-full items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            title="Copy UUID"
          >
            <span className="truncate">{summary.uuid}</span>
            {copied ? (
              <Check className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Copy className="h-3 w-3 shrink-0 opacity-60" />
            )}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary.status && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {summary.status}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setYamlOpen(true)}
            className="h-8 shrink-0 border-border/40 bg-background/20 text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden />
            YAML
          </Button>
          {hasThreatChain ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChainOpen(true)}
              className="h-8 shrink-0 border-border/40 bg-background/20 text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            >
              <GitBranch className="h-3.5 w-3.5" aria-hidden />
              Chain
            </Button>
          ) : null}
        </div>
      </header>

      {hasThreatChain ? (
        <ThreatChainModal
          summary={summary}
          open={chainOpen}
          onOpenChange={setChainOpen}
        />
      ) : null}

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-border/20 px-5 py-3 pr-12">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              YAML
            </h2>
            <p className="mt-0.5 truncate text-sm font-medium">
              {summary.name}
            </p>
          </div>
          <ScrollArea className="h-[calc(85vh-5rem)] max-h-[calc(85vh-5rem)]">
            <div className="p-4">
              {yamlOpen ? <YamlPanel data={body} variant="plain" /> : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ObjectDescriptionPanel({
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  return (
    <ScrollArea className="h-full min-w-0">
      <div className="min-w-0 max-w-full p-5">
        <DescriptionContent body={body} />
      </div>
    </ScrollArea>
  );
}

export function ObjectMetadataTabs({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  return (
    <ScrollArea className="h-full min-h-0 min-w-0">
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-4 pt-3">
        <MetadataSection summary={summary} body={body} />
        <section aria-label="Analysis">
          <PanelSectionHeader icon={ScanSearch}>Analysis</PanelSectionHeader>
          <AssessmentTab summary={summary} body={body} />
        </section>
      </div>
    </ScrollArea>
  );
}

const RELATION_TAB_ORDER = [
  "signal",
  "objective",
  "rule",
  "threat",
  "chains",
] as const;

type RelationTabKey = (typeof RELATION_TAB_ORDER)[number];

const RELATION_TAB_LABELS: Record<Exclude<RelationTabKey, "chains">, string> = {
  signal: "Signals",
  objective: "Objectives",
  rule: "Rules",
  threat: "Threats",
};

const RELATION_EMPTY_LABELS: Record<RelationTabKey, string> = {
  signal: "No related signals",
  objective: "No related objectives",
  rule: "No related rules",
  threat: "No related threats",
  chains: "No threat chains",
};

export function ObjectRelationsPanel({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body?: ObjectBody;
}) {
  const { graphContext, corpusGraph, getSummary } = useExplorer();

  const relations = relationsList(
    graphContext,
    summary.uuid,
    "flat",
    "both",
  ) as Record<string, string[]>;

  const chainingLinks = useMemo(() => {
    const threat = body?.["threat"] as ObjectBody | undefined;
    return (threat?.["chaining"] as Array<ObjectBody> | undefined) ?? [];
  }, [body]);

  const { relatedChainIds, chainsTabCount } = useMemo(() => {
    const tab = chainsTabData(graphContext, summary.uuid, chainingLinks, {
      corpusChainingEdges: corpusGraph.edges,
    });
    return {
      relatedChainIds: tab.relatedChainIds,
      chainsTabCount: tab.count,
    };
  }, [chainingLinks, corpusGraph.edges, graphContext, summary.uuid]);

  const tabs = useMemo(() => {
    const items: Array<{
      key: RelationTabKey;
      label: string;
      icon: LucideIcon;
      ids: string[];
      count: number;
    }> = [];

    for (const key of RELATION_TAB_ORDER) {
      if (key === "chains") {
        if (relatedChainIds.length || chainingLinks.length) {
          items.push({
            key,
            label: "Chains",
            icon: GitBranch,
            ids: relatedChainIds,
            count: chainsTabCount,
          });
        }
        continue;
      }

      const ids = relations[key] ?? [];
      if (ids.length) {
        items.push({
          key,
          label: RELATION_TAB_LABELS[key],
          icon: TYPE_ICONS[key],
          ids,
          count: ids.length,
        });
      }
    }

    return items;
  }, [chainsTabCount, chainingLinks.length, relatedChainIds, relations]);

  const [pickedTab, setPickedTab] = useState<string | null>(null);
  const activeTab =
    pickedTab && tabs.some((tab) => tab.key === pickedTab)
      ? pickedTab
      : (tabs[0]?.key ?? "");

  if (!tabs.length) {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        aria-label="Related objects"
      >
        <RelationsPanelHeader />
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-xs text-muted-foreground">No related objects.</p>
        </div>
      </div>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={setPickedTab}
      className="flex h-full min-h-0 flex-col"
      aria-label="Related objects"
    >
      <RelationsPanelHeader />
      <div className="shrink-0 px-3 pb-1.5 pt-1">
        <TabsList className="inline-flex h-auto max-w-full gap-1 overflow-x-auto bg-muted/30 p-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="gap-1 rounded-full px-2.5 py-0.5 text-[11px] data-[state=active]:bg-background/80 data-[state=active]:text-foreground"
            >
              <tab.icon className="h-3 w-3 shrink-0" aria-hidden />
              {tab.label}
              <Badge
                variant="outline"
                className="h-4 min-w-4 justify-center px-1 py-0 text-[9px] font-normal"
              >
                {tab.count}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent
          key={tab.key}
          value={tab.key}
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full min-h-0">
            {tab.key === "chains" ? (
              <ChainsTabContent
                chainingLinks={chainingLinks}
                relatedChainIds={tab.ids}
                getSummary={getSummary}
              />
            ) : (
              <RelationTabList
                ids={tab.ids}
                tabKey={tab.key}
                getSummary={getSummary}
              />
            )}
          </ScrollArea>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function RelationsPanelHeader() {
  return (
    <div className="shrink-0 border-b border-border/20 px-3 py-1.5">
      <PanelSectionHeader icon={GitBranch} className="mb-0">
        Relations
      </PanelSectionHeader>
    </div>
  );
}

/** Standalone layout for object detail page route */
export function ObjectDetailPanel({ summary, body }: ObjectPanelProps) {
  return (
    <div className="flex h-full min-h-0 w-full max-w-4xl flex-col border-l border-border/20 bg-card">
      <ObjectTitleBar summary={summary} body={body} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <ObjectDescriptionPanel summary={summary} body={body} />
        <div className="border-t border-border/20 md:border-t-0 md:border-l">
          <ObjectMetadataTabs summary={summary} body={body} />
        </div>
      </div>
      <div className="h-[200px] max-h-[220px] shrink-0 border-t border-border/20">
        <ObjectRelationsPanel summary={summary} body={body} />
      </div>
    </div>
  );
}

function DescriptionContent({ body }: { body: ObjectBody }) {
  const description = extractDescription(body);

  return (
    <section>
      <PanelSectionHeader icon={BookOpen}>Description</PanelSectionHeader>
      {description ? (
        <MarkdownText>{description}</MarkdownText>
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </section>
  );
}

function extractDescription(body: ObjectBody): string | null {
  if (typeof body["description"] === "string") return body["description"];
  const threat = body["threat"] as ObjectBody | undefined;
  if (typeof threat?.["description"] === "string") return threat["description"];
  const objective = body["objective"] as ObjectBody | undefined;
  if (typeof objective?.["description"] === "string") {
    return objective["description"];
  }
  return null;
}

function MarkdownText({ children }: { children: string }) {
  return (
    <div className="markdown-content min-w-0 max-w-full text-sm leading-relaxed text-foreground/90">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

function AssessmentTab({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const { bundle } = useExplorer();
  const staging = bundle.stagingIndex?.deployments[summary.uuid];

  return (
    <div className="space-y-6">
      <SchemaAssessment summary={summary} body={body} />
      {summary.type === "signal" ? (
        <ExamplesList examples={body["examples"]} />
      ) : null}
      {staging && Object.keys(staging).length > 0 ? (
        <DeploymentsSection staging={staging} />
      ) : null}
      {summary.type === "rule" ? (
        <PlatformsTab summary={summary} body={body} />
      ) : null}
    </div>
  );
}

function DeploymentsSection({ staging }: { staging: Record<string, string> }) {
  return (
    <section>
      <PanelSectionHeader icon={Server}>Deployments</PanelSectionHeader>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(staging).map(([platform, status]) => (
          <Badge key={platform} variant="outline" className="text-[10px]">
            {platform.replace(/_/g, " ")}: {status}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function ChainsTabContent({
  chainingLinks,
  relatedChainIds,
  getSummary,
}: {
  chainingLinks: Array<ObjectBody>;
  relatedChainIds: string[];
  getSummary: (uuid: string) => BundleObjectSummary | undefined;
}) {
  const { setSelectedId, vocabIndex } = useExplorer();

  if (!chainingLinks.length && !relatedChainIds.length) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {RELATION_EMPTY_LABELS.chains}
      </p>
    );
  }

  return (
    <div className="space-y-3 px-2 py-2">
      {chainingLinks.map((link, i) => {
        const relation = String(link["relation"] ?? "");
        const vector =
          typeof link["vector"] === "string" ? link["vector"] : undefined;
        const description =
          typeof link["description"] === "string"
            ? link["description"]
            : undefined;
        const term = relation
          ? lookupChainingRelation(vocabIndex, relation)
          : undefined;
        const target = vector ? getSummary(vector) : undefined;
        const TargetIcon = target ? TYPE_ICONS[target.type] : GitBranch;

        return (
          <div
            key={chainingLinkRowKey(link, i)}
            className="rounded-lg border border-border bg-card p-3 shadow-sm"
          >
            {relation ? (
              <VocabTooltip
                label={term?.name ?? relation}
                description={term?.description}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
                  {relation}
                </button>
              </VocabTooltip>
            ) : null}
            {description ? (
              <div className="mt-2">
                <MarkdownText>{description}</MarkdownText>
              </div>
            ) : null}
            {target ? (
              <button
                type="button"
                className="list-row-default mt-2 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors"
                onClick={() => setSelectedId(vector!)}
              >
                <span className={typeIconBadgeClass(target.type, "sm")}>
                  <TargetIcon className="h-3 w-3" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {target.name}
                </span>
              </button>
            ) : vector ? (
              <p className="mt-2 text-[10px] text-muted-foreground">
                → {vector}
              </p>
            ) : null}
          </div>
        );
      })}

      {relatedChainIds.length > 0 && chainingLinks.length > 0 ? (
        <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Related threats
        </p>
      ) : null}

      {relatedChainIds.length > 0 ? (
        <RelationTabList
          ids={relatedChainIds}
          tabKey="chains"
          getSummary={getSummary}
          variant="card"
        />
      ) : null}
    </div>
  );
}

function ExamplesList({ examples }: { examples: unknown }) {
  if (!Array.isArray(examples) || !examples.length) return null;

  return (
    <section>
      <PanelSectionHeader icon={Zap}>Detection examples</PanelSectionHeader>
      <ul className="space-y-4">
        {examples.map((example, index) => {
          if (!example || typeof example !== "object") return null;
          const ex = example as ObjectBody;
          return (
            <li
              key={`${String(ex["description"] ?? "")}-${String(ex["language"] ?? "")}-${String(ex["link"] ?? index)}`}
              className="border border-border/30 bg-muted/10 p-3"
            >
              {Boolean(ex["description"]) && (
                <MarkdownText>{String(ex["description"])}</MarkdownText>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {Boolean(ex["language"]) && (
                  <Badge variant="outline">{String(ex["language"])}</Badge>
                )}
                {Boolean(ex["link"]) && (
                  <a
                    href={String(ex["link"])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Reference <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {typeof ex["query"] === "string" && (
                <div className="mt-3 min-w-0 overflow-hidden">
                  <QueryViewer
                    platform={String(ex["language"] ?? "query")}
                    query={ex["query"]}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RelationTabList({
  ids,
  tabKey,
  getSummary,
  variant = "default",
}: {
  ids: string[];
  tabKey: RelationTabKey;
  getSummary: (uuid: string) => BundleObjectSummary | undefined;
  variant?: "default" | "card";
}) {
  const { setSelectedId } = useExplorer();

  if (!ids.length) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {RELATION_EMPTY_LABELS[tabKey]}
      </p>
    );
  }

  return (
    <ul
      className={variant === "card" ? "space-y-2 px-1.5 py-1" : "px-1.5 py-1"}
    >
      {ids.map((id) => {
        const rel = getSummary(id);
        const relType = (rel?.type ?? inferTypeFromTab(tabKey)) as ObjectType;
        const RelIcon =
          tabKey === "chains"
            ? rel
              ? TYPE_ICONS[rel.type]
              : GitBranch
            : (TYPE_ICONS[relType] ?? Link2);

        return (
          <li key={id}>
            <button
              type="button"
              className={
                variant === "card"
                  ? "list-row-default flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left shadow-sm transition-colors"
                  : "flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
              }
              onClick={() => setSelectedId(id)}
            >
              <span
                className={
                  rel
                    ? typeIconBadgeClass(rel.type, "sm")
                    : tabKey === "chains"
                      ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"
                      : typeIconBadgeClass(relType, "sm")
                }
              >
                <RelIcon className="h-3 w-3" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium leading-snug">
                {rel?.name ?? id}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function inferTypeFromTab(tabKey: RelationTabKey): ObjectType {
  if (tabKey === "chains") return "threat";
  return tabKey;
}

function PlatformsTab({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  if (summary.type !== "rule") {
    return null;
  }

  const configs = body["configurations"] as
    | Record<string, ObjectBody>
    | undefined;
  if (!configs) {
    return (
      <p className="text-sm text-muted-foreground">
        No platform configurations.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <PanelSectionHeader icon={Server}>Platforms</PanelSectionHeader>
      {Object.entries(configs).map(([platform, config]) => {
        const query = config?.["query"];
        const status = String(config?.["status"] ?? "");
        return (
          <section key={platform}>
            <div className="mb-2 flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {platform.replace(/_/g, " ")}
              </span>
              {status && <Badge variant="outline">{status}</Badge>}
            </div>
            {typeof query === "string" ? (
              <div className="min-w-0 overflow-hidden">
                <QueryViewer platform={platform} query={query} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No query configured.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
