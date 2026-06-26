"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useExplorer } from "./explorer-context";
import { buildOramaIndex, searchCatalog } from "@/lib/search/orama";
import type { SearchDocument } from "@/lib/opentide/types";

export function CommandPalette() {
  const { search, setFocusId, setMode, getSummary, pushBreadcrumb } =
    useExplorer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ document: SearchDocument; score: number }>
  >([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const db = await buildOramaIndex(search.documents);
      const hits = await searchCatalog(db, query);
      if (!cancelled) {
        setResults(
          hits.map((h) => ({
            document: h.document as SearchDocument,
            score: h.score,
          })),
        );
      }
    }
    if (open) run();
    return () => {
      cancelled = true;
    };
  }, [query, open, search.documents]);

  function select(uuid: string) {
    const summary = getSummary(uuid);
    if (summary) {
      setFocusId(uuid);
      pushBreadcrumb(summary);
      setMode("graph");
    }
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden">
        <Command className="bg-card" shouldFilter={false}>
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <Command.Input
              placeholder="Search by name, UUID, technique, type:rule platform:sentinel..."
              value={query}
              onValueChange={setQuery}
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </Command.Empty>
            {results.map((r) => (
              <Command.Item
                key={r.document.uuid}
                value={r.document.uuid}
                onSelect={() => select(r.document.uuid)}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
              >
                <span className="truncate">{r.document.name}</span>
                <Badge variant={r.document.type as "threat"}>
                  {r.document.type}
                </Badge>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
