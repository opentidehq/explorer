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

export function ObjectHoverTooltip({
  name,
  description,
  children,
  contentClassName,
  side = "right",
  align = "start",
  sideOffset,
  collisionPadding = 8,
  delayDuration = 350,
}: {
  name: string;
  description?: string | null;
  children: ReactElement;
  contentClassName?: string;
  side?: TooltipContentProps["side"];
  align?: TooltipContentProps["align"];
  sideOffset?: number;
  collisionPadding?: number;
  delayDuration?: number;
}) {
  const trimmedName = name.trim();
  const hasDescription = Boolean(description?.trim());

  if (!trimmedName) return children;

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
          "flex max-w-[min(360px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 font-sans",
          contentClassName,
        )}
      >
        <p className="shrink-0 px-3 pt-2.5 pb-1.5 text-[11px] font-semibold leading-snug text-foreground">
          {trimmedName}
        </p>
        {hasDescription ? (
          <div
            className={cn(
              "markdown-content max-h-[240px] overflow-y-auto px-3 pb-2.5 text-[11px] leading-relaxed text-foreground/85",
              "[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground",
            )}
          >
            <ReactMarkdown>{description!}</ReactMarkdown>
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
