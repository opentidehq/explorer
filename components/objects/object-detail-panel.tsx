"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { YamlPanel } from "@/components/code/yaml-panel";
import { QueryViewer } from "@/components/code/query-viewer";
import { useExplorer } from "@/components/shell/explorer-context";
import { relationsList } from "@/lib/opentide/graph";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

interface ObjectDetailPanelProps {
  summary: BundleObjectSummary;
  body: ObjectBody;
}

export function ObjectDetailPanel({ summary, body }: ObjectDetailPanelProps) {
  const { graphContext, setFocusId, setMode } = useExplorer();
  const relations = relationsList(
    graphContext,
    summary.uuid,
    "flat",
    "both",
  ) as Record<string, string[]>;

  return (
    <aside className="w-96 shrink-0 border-l border-border bg-card/80 backdrop-blur-md">
      <ScrollArea className="h-full">
        <div className="space-y-4 p-4">
          <header>
            <Badge variant={summary.type}>{summary.type}</Badge>
            <h2 className="mt-2 text-lg font-semibold leading-tight">
              {summary.name}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              {summary.uuid}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.schema && (
                <Badge variant="outline">{summary.schema}</Badge>
              )}
              {summary.tlp && (
                <Badge variant="outline">TLP:{summary.tlp}</Badge>
              )}
              {summary.status && (
                <Badge variant="outline">{summary.status}</Badge>
              )}
            </div>
          </header>

          <Tabs defaultValue="overview">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">
                Overview
              </TabsTrigger>
              <TabsTrigger value="platforms" className="flex-1">
                Platforms
              </TabsTrigger>
              <TabsTrigger value="raw" className="flex-1">
                YAML
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <ThreatSections body={body} type={summary.type} />
              <ObjectiveSections body={body} type={summary.type} />
              <RuleSections body={body} type={summary.type} />

              {summary.techniques.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-medium">ATT&CK</h3>
                  <div className="flex flex-wrap gap-1">
                    {summary.techniques.map((t) => (
                      <a
                        key={t}
                        href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {t}
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-medium">Relations</h3>
                {Object.entries(relations).map(([type, ids]) => (
                  <div key={type} className="mb-2">
                    <p className="text-xs text-muted-foreground capitalize">
                      {type}
                    </p>
                    <ul className="space-y-1">
                      {ids.slice(0, 5).map((id) => (
                        <li key={id}>
                          <button
                            className="text-left text-xs text-primary hover:underline"
                            onClick={() => {
                              setFocusId(id);
                              setMode("graph");
                            }}
                          >
                            {id.slice(0, 8)}…
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </TabsContent>

            <TabsContent value="platforms">
              <PlatformTabs body={body} type={summary.type} />
            </TabsContent>

            <TabsContent value="raw">
              <YamlPanel data={body} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </aside>
  );
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

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">Assessment</h3>
      <dl className="space-y-2 text-xs">
        {fields.map(([label, value]) =>
          value ? (
            <div key={String(label)}>
              <dt className="text-muted-foreground">{String(label)}</dt>
              <dd className="whitespace-pre-wrap">
                {String(value).slice(0, 500)}
              </dd>
            </div>
          ) : null,
        )}
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
      <h3 className="mb-2 text-sm font-medium">Signals ({signals.length})</h3>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li
            key={String(s["uuid"])}
            className="rounded border border-border p-2 text-xs"
          >
            <p className="font-medium">{String(s["name"] ?? "Signal")}</p>
            {Boolean(s["description"]) && (
              <p className="mt-1 text-muted-foreground">
                {String(s["description"]).slice(0, 200)}…
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
      <h3 className="mb-2 text-sm font-medium">Description</h3>
      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
        {String(description).slice(0, 600)}…
      </p>
    </section>
  );
}

function PlatformTabs({ body, type }: { body: ObjectBody; type: string }) {
  if (type !== "rule") {
    return (
      <p className="text-xs text-muted-foreground">
        Platform queries are available on detection rules.
      </p>
    );
  }

  const configs = body["configurations"] as
    | Record<string, ObjectBody>
    | undefined;
  if (!configs) return null;

  const platforms = Object.keys(configs);
  if (!platforms.length) return null;

  return (
    <Tabs defaultValue={platforms[0]}>
      <TabsList className="flex h-auto flex-wrap">
        {platforms.map((p) => (
          <TabsTrigger key={p} value={p} className="text-xs">
            {p.replace(/_/g, " ")}
            <Badge variant="outline" className="ml-1 text-[10px]">
              {String(configs[p]?.["status"] ?? "")}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      {platforms.map((p) => {
        const query = configs[p]?.["query"];
        return (
          <TabsContent key={p} value={p}>
            {typeof query === "string" ? (
              <QueryViewer platform={p} query={query} />
            ) : (
              <p className="text-xs text-muted-foreground">
                No query configured.
              </p>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
