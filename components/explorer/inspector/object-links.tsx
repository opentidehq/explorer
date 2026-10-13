"use client";

import { useMemo } from "react";
import { CornerDownRight } from "lucide-react";
import {
  useCatalog,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { Section } from "@/components/explorer/inspector/object-overview";
import { Markdown } from "@/components/ui/markdown";
import { TypeIcon } from "@/components/ui/tide";
import { linkGroups, type LinkCard } from "@/lib/explorer/links";
import { cn } from "@/lib/utils";

const KIND_LABEL = {
  uuid: "UUID",
  nested: "nested",
  derived: "via chain",
} as const;

/** One link, read from its field: `objective.threats → threat`, the object it names, why. */
function Card({ card }: { card: LinkCard }) {
  const { summaries } = useCatalog();
  const actions = useExplorerActions();
  const other = summaries.get(card.otherId);
  const [owner, ...path] = card.field.split(".");
  return (
    <li>
      <button
        type="button"
        onClick={() => actions.select(card.otherId, { tab: "links" })}
        className="block w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent/45 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-mono text-[11px] text-subtle">
            <span className="text-ink">{owner}</span>.{path.join(".")} →{" "}
            <span className="font-semibold text-accent">{card.target}</span>
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-px font-mono text-[10px] leading-4",
              card.kind === "uuid"
                ? "border border-accent/45 text-accent"
                : "border border-dashed border-ink/25 text-subtle",
            )}
          >
            {KIND_LABEL[card.kind]}
          </span>
        </span>
        {card.relation ? (
          <span className="mt-1.5 inline-block rounded-md bg-band px-1.5 py-0.5 font-mono text-[11px] text-ink">
            relation: {card.relation}
          </span>
        ) : null}
        <span className="mt-1.5 flex items-start gap-2">
          {other ? (
            <TypeIcon type={other.type} size="xs" className="mt-0.5" />
          ) : null}
          <span className="min-w-0 text-[13px] font-medium leading-snug text-ink">
            {other?.name ?? card.otherId}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] text-subtle">
          <CornerDownRight
            className="size-3 shrink-0 text-accent"
            aria-hidden
          />
          <span className="truncate">{card.otherId}</span>
        </span>
        {card.description ? (
          <Markdown className="mt-2 text-[12.5px]">{card.description}</Markdown>
        ) : null}
      </button>
    </li>
  );
}

export function ObjectLinks({ id }: { id: string }) {
  const catalog = useCatalog();
  const groups = useMemo(() => linkGroups(catalog, id), [catalog, id]);
  if (!groups.length) {
    return (
      <p className="rounded-xl border border-dashed border-ink/20 px-4 py-6 text-center text-sm text-subtle">
        Nothing links to or from this object yet.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Section
          key={group.key}
          label={group.title}
          aside={String(group.cards.length)}
        >
          <ul className="space-y-2">
            {group.cards.map((card) => (
              <Card key={card.key} card={card} />
            ))}
          </ul>
        </Section>
      ))}
      <p className="font-mono text-[10.5px] leading-relaxed text-subtle">
        UUID references are resolved by opentide validate; nested signals live
        inside their objective&apos;s file.
      </p>
    </div>
  );
}
