import {
  Biohazard,
  Brackets,
  Crosshair,
  Signal,
  type LucideIcon,
} from "lucide-react";
import type { ObjectType } from "@/lib/opentide/types";

/** Shared Lucide icons for graph legend, detail panel, and command palette. */
export const TYPE_ICONS: Record<ObjectType, LucideIcon> = {
  threat: Biohazard,
  objective: Crosshair,
  signal: Signal,
  rule: Brackets,
};

export const TYPE_LABELS: Record<ObjectType, string> = {
  threat: "THREAT",
  objective: "OBJECTIVE",
  signal: "SIGNAL",
  rule: "RULE",
};

export const TYPE_TEXT_CLASS: Record<ObjectType, string> = {
  threat: "text-threat",
  objective: "text-objective",
  signal: "text-signal",
  rule: "text-rule",
};

export const TYPE_BORDER_CLASS: Record<ObjectType, string> = {
  threat: "border-threat/50",
  objective: "border-objective/50",
  signal: "border-signal/50",
  rule: "border-rule/50",
};

export const TYPE_BG_CLASS: Record<ObjectType, string> = {
  threat: "bg-threat/10",
  objective: "bg-objective/10",
  signal: "bg-signal/10",
  rule: "bg-rule/10",
};

const TYPE_ICON_BADGE_SIZES = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-11 w-11 border-2",
} as const;

/** Circular type-colored icon badge shared across detail panel and modals. */
export function typeIconBadgeClass(
  type: ObjectType,
  size: keyof typeof TYPE_ICON_BADGE_SIZES = "sm",
): string {
  return [
    "flex shrink-0 items-center justify-center rounded-full border",
    TYPE_ICON_BADGE_SIZES[size],
    TYPE_BORDER_CLASS[type],
    TYPE_BG_CLASS[type],
    TYPE_TEXT_CLASS[type],
  ].join(" ");
}
