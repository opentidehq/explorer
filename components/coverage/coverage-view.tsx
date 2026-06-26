"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExplorer } from "@/components/shell/explorer-context";

const TACTIC_ORDER = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
];

export function CoverageView() {
  const {
    coverage,
    attackNavigator,
    setFocusId,
    setMode,
    getSummary,
    pushBreadcrumb,
  } = useExplorer();

  const techniques = attackNavigator?.techniques ?? [];
  const byTactic = new Map<string, typeof techniques>();

  for (const tech of techniques) {
    const tacticNum = parseInt(tech.techniqueID.slice(1, 5), 10);
    const tacticIdx = Math.floor((tacticNum - 1000) / 100);
    const tactic = TACTIC_ORDER[tacticIdx] ?? "Other";
    const list = byTactic.get(tactic) ?? [];
    list.push(tech);
    byTactic.set(tactic, list);
  }

  function openGap(objectId: string) {
    const summary = getSummary(objectId);
    if (summary) {
      setFocusId(objectId);
      pushBreadcrumb(summary);
      setMode("graph");
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Gap dashboard</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {coverage.gaps.slice(0, 20).map((gap) => (
              <Card
                key={`${gap.kind}-${gap.objectId}`}
                className="cursor-pointer hover:border-primary/50"
                onClick={() => openGap(gap.objectId)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{gap.objectName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{gap.kind}</Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {gap.detail}
                  </p>
                </CardContent>
              </Card>
            ))}
            {coverage.gaps.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No coverage gaps detected.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Platform deployment</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(coverage.platformRollup).map(
              ([platform, stats]) => (
                <Badge key={platform} variant="outline" className="px-3 py-2">
                  {platform}: {stats.covered}/{stats.total} rules
                </Badge>
              ),
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">ATT&CK matrix</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            <span className="inline-block h-3 w-3 rounded bg-[#fc6b6b] mr-1" />{" "}
            TVM-only
            <span className="inline-block h-3 w-3 rounded bg-[#8ec843] mx-2" />{" "}
            Full coverage
            <span className="inline-block h-3 w-3 rounded bg-[#6495ed] mr-1" />{" "}
            MDR-only
          </p>
          <div className="space-y-4">
            {TACTIC_ORDER.map((tactic) => {
              const techs = byTactic.get(tactic);
              if (!techs?.length) return null;
              return (
                <div key={tactic}>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    {tactic}
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {techs.map((t) => (
                      <div
                        key={t.techniqueID}
                        title={t.comment}
                        className="rounded px-2 py-1 font-mono text-[10px] text-white"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.techniqueID}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
