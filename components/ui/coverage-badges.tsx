import {
  TYPE_BG_CLASS,
  TYPE_ICONS,
  TYPE_TEXT_CLASS,
} from "@/lib/graph/type-icons";
import type { ObjectType } from "@/lib/opentide/types";
import type { CoverageCounts } from "@/lib/graph/list-view-data";
import { cn } from "@/lib/utils";

const COVERAGE_ORDER: ObjectType[] = ["threat", "objective", "signal", "rule"];

type CoverageBadgesProps = {
  counts: CoverageCounts;
  variant?: "default" | "compact";
  className?: string;
};

export function CoverageBadges({
  counts,
  variant = "default",
  className,
}: CoverageBadgesProps) {
  const entries = COVERAGE_ORDER.filter((type) => (counts[type] ?? 0) > 0);
  if (!entries.length) return null;

  const compact = variant === "compact";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        compact ? "flex-nowrap gap-0.5" : "flex-wrap justify-end gap-1",
        className,
      )}
    >
      {entries.map((type) => {
        const Icon = TYPE_ICONS[type];
        const count = counts[type]!;
        return (
          <span
            key={type}
            className={cn(
              "explorer-interactive inline-flex items-center rounded-full border border-border/20 font-medium tabular-nums",
              compact
                ? "gap-0.5 px-1 py-0.5 text-[10px]"
                : "gap-0.5 px-1.5 py-0.5 text-[9px]",
              TYPE_BG_CLASS[type],
              TYPE_TEXT_CLASS[type],
            )}
            title={`${count} ${type}${count === 1 ? "" : "s"}`}
          >
            <Icon
              className={cn("shrink-0", compact ? "h-3 w-3" : "h-2.5 w-2.5")}
              aria-hidden
            />
            <span className={compact ? "min-w-[2ch] text-center" : undefined}>
              {count}
            </span>
          </span>
        );
      })}
    </div>
  );
}
