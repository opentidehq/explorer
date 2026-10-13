import {
  Activity,
  FileCode2,
  Swords,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { ObjectType } from "@/lib/opentide/types";

/** The ontology's icons, as on opentide.org: threat, objective, signals, rule. */
export const TYPE_ICONS: Record<ObjectType, LucideIcon> = {
  threat: Swords,
  objective: Target,
  signal: Activity,
  rule: FileCode2,
};

export const TYPE_LABELS: Record<ObjectType, string> = {
  threat: "Threat",
  objective: "Objective",
  signal: "Signal",
  rule: "Rule",
};

export const TYPE_PLURALS: Record<ObjectType, string> = {
  threat: "threats",
  objective: "objectives",
  signal: "signals",
  rule: "rules",
};

/** What each type answers, in the site's words. */
export const TYPE_QUESTIONS: Record<ObjectType, string> = {
  threat: "What do we defend against?",
  objective: "What do we detect?",
  signal: "What does it look like?",
  rule: "Where and how does it fire?",
};

/** CSS colour per type; resolves per theme (see app/globals.css). */
export const TYPE_COLOR_VAR: Record<ObjectType, string> = {
  threat: "var(--type-threat)",
  objective: "var(--type-objective)",
  signal: "var(--type-signal)",
  rule: "var(--type-rule)",
};

export const TYPE_TEXT_CLASS: Record<ObjectType, string> = {
  threat: "text-threat",
  objective: "text-objective",
  signal: "text-signal",
  rule: "text-rule",
};
