"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExplorer } from "@/components/shell/explorer-context";
import type { ObjectType } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

const TYPES: ObjectType[] = ["threat", "objective", "signal", "rule"];

export function CatalogView() {
  const { bundle } = useExplorer();
  const [typeFilter, setTypeFilter] = useState<ObjectType | "all">("all");
  const [sortKey, setSortKey] = useState<"name" | "related" | "type">("name");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => {
    let items = bundle.summaries;
    if (typeFilter !== "all") {
      items = items.filter((s) => s.type === typeFilter);
    }
    return [...items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "related") cmp = a.relatedCount - b.relatedCount;
      else cmp = a.type.localeCompare(b.type);
      return sortAsc ? cmp : -cmp;
    });
  }, [bundle.summaries, typeFilter, sortKey, sortAsc]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <Button
          size="sm"
          variant={typeFilter === "all" ? "secondary" : "ghost"}
          onClick={() => setTypeFilter("all")}
        >
          All ({bundle.summaries.length})
        </Button>
        {TYPES.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={typeFilter === t ? "secondary" : "ghost"}
            onClick={() => setTypeFilter(t)}
          >
            {t} ({bundle.summaries.filter((s) => s.type === t).length})
          </Button>
        ))}
      </div>
      <ScrollArea className="flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="p-3">
                <button onClick={() => toggleSort("name")}>Name</button>
              </th>
              <th className="p-3">
                <button onClick={() => toggleSort("type")}>Type</button>
              </th>
              <th className="p-3">ATT&CK</th>
              <th className="p-3">Platforms</th>
              <th className="p-3">
                <button onClick={() => toggleSort("related")}>Related</button>
              </th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.uuid}
                className="border-b border-border/50 hover:bg-muted/30"
              >
                <td className="p-3">
                  <Link
                    href={`/${row.type}s/${row.uuid}`}
                    className="font-medium hover:text-primary"
                  >
                    {row.name}
                  </Link>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {row.uuid}
                  </p>
                </td>
                <td className="p-3">
                  <Badge variant={row.type}>{row.type}</Badge>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {row.techniques.slice(0, 3).map((t) => (
                      <span key={t} className="font-mono text-xs text-signal">
                        {t}
                      </span>
                    ))}
                    {row.techniques.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{row.techniques.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {row.platforms.slice(0, 2).map((p) => (
                      <Badge key={p} variant="outline">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-center">{row.relatedCount}</td>
                <td className="p-3">
                  {row.status && (
                    <Badge
                      variant="outline"
                      className={cn(
                        row.status === "PRODUCTION" && "text-rule",
                        row.status === "STAGING" && "text-signal",
                      )}
                    >
                      {row.status}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
