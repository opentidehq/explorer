"use client";

import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Grid3x3, Moon, Network, Rows3, Search, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import {
  useCatalog,
  useExplorer,
  useExplorerActions,
  type ExplorerView,
} from "@/components/explorer/explorer-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, TypeIcon } from "@/components/ui/tide";
import { searchCatalog } from "@/lib/search/engine";
import { DEFAULT_FILTERS, parseFilterTokens } from "@/lib/search/filters";

const VIEWS: Array<{
  value: ExplorerView;
  label: string;
  icon: typeof Network;
  key: string;
}> = [
  { value: "graph", label: "Graph", icon: Network, key: "1" },
  { value: "catalogue", label: "Catalogue", icon: Rows3, key: "2" },
  { value: "attack", label: "ATT&CK matrix", icon: Grid3x3, key: "3" },
];

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-ink aria-selected:bg-accent/10";

/** ⌘K: jump to any object by name, id, technique or actor; switch views; flip the theme. */
export function CommandPalette() {
  const catalog = useCatalog();
  const actions = useExplorerActions();
  const open = useExplorer((s) => s.paletteOpen);
  const query = useExplorer((s) => s.query);
  const { resolvedTheme, setTheme } = useTheme();
  const [input, setInput] = useState("");

  const results = useMemo(() => {
    const filters = input.trim() ? parseFilterTokens(input) : DEFAULT_FILTERS;
    return searchCatalog(catalog.search, filters, {
      stagingIndex: catalog.bundle.stagingIndex,
      limit: input.trim() ? 40 : 12,
    });
  }, [catalog, input]);

  const close = () => {
    actions.setPaletteOpen(false);
    setInput("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? actions.setPaletteOpen(true) : close())}
    >
      <DialogContent
        hideClose
        placement="top"
        className="max-w-xl overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        <DialogDescription className="sr-only">
          Search objects by name, UUID, ATT&amp;CK technique or actor.
        </DialogDescription>
        <Command
          shouldFilter={false}
          loop
          className="flex max-h-[60vh] flex-col"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-subtle" aria-hidden />
            <Command.Input
              value={input}
              onValueChange={setInput}
              placeholder="Jump to a threat, objective, rule, technique…"
              className="h-13 min-w-0 flex-1 bg-transparent py-4 text-[14px] text-ink outline-none placeholder:text-subtle"
            />
            <Kbd>esc</Kbd>
          </div>
          <Command.List className="tide-scroll min-h-0 flex-1 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-subtle">
              Nothing matches “{input}”.
            </Command.Empty>

            {results.length ? (
              <Command.Group
                heading={
                  input.trim() ? `objects · ${results.length}` : "objects"
                }
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle"
              >
                {results.map((doc) => (
                  <Command.Item
                    key={doc.uuid}
                    value={doc.uuid}
                    onSelect={() => {
                      actions.select(doc.uuid);
                      close();
                    }}
                    className={itemClass}
                  >
                    <TypeIcon type={doc.type} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {doc.name}
                      </span>
                      <span className="block truncate font-mono text-[10.5px] text-subtle">
                        {[
                          doc.schema || doc.type,
                          doc.techniques.slice(0, 3).join(" "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            <Command.Group
              heading="views"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-subtle"
            >
              {VIEWS.filter((view) =>
                view.label.toLowerCase().includes(input.trim().toLowerCase()),
              ).map((view) => (
                <Command.Item
                  key={view.value}
                  value={`view-${view.value}`}
                  onSelect={() => {
                    actions.setView(view.value);
                    close();
                  }}
                  className={itemClass}
                >
                  <view.icon className="size-4 text-subtle" aria-hidden />
                  <span className="flex-1">{view.label}</span>
                  <Kbd>{view.key}</Kbd>
                </Command.Item>
              ))}
              {"theme".includes(input.trim().toLowerCase()) || !input.trim() ? (
                <Command.Item
                  value="theme"
                  onSelect={() => {
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                    close();
                  }}
                  className={itemClass}
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="size-4 text-subtle" aria-hidden />
                  ) : (
                    <Moon className="size-4 text-subtle" aria-hidden />
                  )}
                  <span className="flex-1">
                    Switch to {resolvedTheme === "dark" ? "light" : "dark"}{" "}
                    theme
                  </span>
                </Command.Item>
              ) : null}
              {query &&
              (!input.trim() ||
                "clear search".includes(input.trim().toLowerCase())) ? (
                <Command.Item
                  value="clear"
                  onSelect={() => {
                    actions.resetFilters();
                    close();
                  }}
                  className={itemClass}
                >
                  <X className="size-4 text-subtle" aria-hidden />
                  <span className="flex-1">Clear the search</span>
                </Command.Item>
              ) : null}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
