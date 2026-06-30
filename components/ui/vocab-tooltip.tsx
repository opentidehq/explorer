"use client";

import type { ComponentProps, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TooltipContentProps = ComponentProps<typeof TooltipContent>;

export function VocabTooltip({
  label,
  description,
  aliases,
  children,
  contentClassName,
  side = "top",
  align = "start",
  sideOffset,
  collisionPadding = 8,
  delayDuration = 350,
}: {
  label?: string;
  description?: string;
  aliases?: string[];
  children: ReactElement;
  contentClassName?: string;
  side?: TooltipContentProps["side"];
  align?: TooltipContentProps["align"];
  sideOffset?: number;
  collisionPadding?: number;
  delayDuration?: number;
}) {
  const hasDescription = Boolean(description?.trim());
  const extraAliases =
    aliases?.filter(
      (alias) => alias.toLowerCase() !== label?.trim().toLowerCase(),
    ) ?? [];
  const hasAliases = extraAliases.length > 0;

  if (!hasDescription && !hasAliases) return children;

  const showLabel = Boolean(label?.trim());

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions
        className={cn(
          "flex max-w-[360px] flex-col gap-0 overflow-hidden p-0",
          contentClassName,
        )}
      >
        {showLabel ? (
          <p className="shrink-0 px-3 pt-2.5 pb-1.5 text-[11px] font-semibold text-foreground">
            {label}
          </p>
        ) : null}
        {hasAliases && !hasDescription ? (
          <p className="px-3 pb-2.5 text-[11px] leading-relaxed text-foreground/85">
            Also known as: {extraAliases.slice(0, 8).join(", ")}
            {extraAliases.length > 8 ? "…" : ""}
          </p>
        ) : null}
        {hasDescription ? (
          <div
            className={cn(
              "markdown-content max-h-[240px] overflow-y-auto px-3 pb-2.5 text-[11px] leading-relaxed text-foreground/85",
              "[&_p]:mb-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground",
              showLabel ? "pt-0" : "pt-2.5",
            )}
          >
            <ReactMarkdown>{description!}</ReactMarkdown>
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
