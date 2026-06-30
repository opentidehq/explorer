"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useExplorer } from "./explorer-context";
import { buildOramaIndex, searchCatalog } from "@/lib/search/orama";
import { DEFAULT_FILTERS, parseFilterTokens } from "@/lib/search/filters";
import { TYPE_ICONS } from "@/lib/graph/type-icons";
import type { ObjectType, SearchDocument } from "@/lib/opentide/types";

export function CommandPalette() {
  const { search, filters, setFilters, setSelectedId, getSummary, bundle } =
    useExplorer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchDocument[]>([]);

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
      const merged = query.trim()
        ? parseFilterTokens(query)
        : { ...filters, query: "" };
      const db = await buildOramaIndex(search.documents);
      const hits = await searchCatalog(db, merged, {
        stagingIndex: bundle.stagingIndex,
        limit: 30,
        documents: search.documents,
      });
      if (!cancelled) setResults(hits);
    }
    if (open) run();
    return () => {
      cancelled = true;
    };
  }, [query, open, search.documents, filters, bundle.stagingIndex]);

  function select(uuid: string) {
    const summary = getSummary(uuid);
    if (summary) {
      setSelectedId(uuid);
      setFilters({ ...DEFAULT_FILTERS, uuid });
    }
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <Command className="bg-card" shouldFilter={false}>
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <Command.Input
              placeholder="Jump to object… type:threat technique:T1059"
              value={query}
              onValueChange={setQuery}
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </Command.Empty>
            {results.map((doc) => {
              const Icon = TYPE_ICONS[doc.type as ObjectType];
              return (
                <Command.Item
                  key={doc.uuid}
                  value={doc.uuid}
                  onSelect={() => select(doc.uuid)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                  <Badge variant={doc.type}>{doc.type}</Badge>
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
