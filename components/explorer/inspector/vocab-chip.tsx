"use client";

import { ExternalLink } from "lucide-react";
import { useCatalog } from "@/components/explorer/explorer-state";
import { Markdown } from "@/components/ui/markdown";
import { VocabValue } from "@/components/ui/tide";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { safeHttpUrl } from "@/lib/opentide/safe-href";
import {
  formatActorFallbackLabel,
  formatVocabDisplayName,
  lookupVocabTerm,
} from "@/lib/opentide/vocab";
import { cn } from "@/lib/utils";

/**
 * A vocabulary value as a chip. Hover shows what the term means in the taxonomy; terms with
 * a reference (ATT&CK groups, CVEs) link out.
 */
export function VocabChip({
  value,
  vocab,
  tone = "outline",
}: {
  value: string;
  vocab?: string;
  tone?: "outline" | "accent";
}) {
  const { vocab: index } = useCatalog();
  const term = vocab ? lookupVocabTerm(index, vocab, value) : undefined;
  const label = term
    ? formatVocabDisplayName(term.name)
    : formatActorFallbackLabel(value);
  const aliases =
    term?.aliases?.filter((a) => a.toLowerCase() !== label.toLowerCase()) ?? [];

  const className = cn(
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-snug transition-colors",
    tone === "accent"
      ? "border-transparent bg-accent/10 text-accent hover:bg-accent/15"
      : "border-line text-muted hover:border-accent/45 hover:text-ink",
  );
  const link = term?.link ? safeHttpUrl(term.link) : null;
  const content = (
    <>
      <span className="min-w-0 truncate">
        <VocabValue value={label} />
      </span>
      {link ? (
        <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
      ) : null}
    </>
  );
  const chip = link ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  ) : (
    <span tabIndex={term?.description ? 0 : undefined} className={className}>
      {content}
    </span>
  );

  if (!term?.description && !aliases.length) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-80">
        <p className="font-semibold">{label}</p>
        {vocab ? (
          <p className="font-mono text-[10.5px] text-subtle">{vocab}</p>
        ) : null}
        {term?.description ? (
          <Markdown className="mt-1 max-h-48 overflow-y-auto text-xs">
            {term.description}
          </Markdown>
        ) : null}
        {aliases.length ? (
          <p className="mt-1 text-[11px] text-subtle">
            also {aliases.slice(0, 6).join(", ")}
            {aliases.length > 6 ? "…" : ""}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
