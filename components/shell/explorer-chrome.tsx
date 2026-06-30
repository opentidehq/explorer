import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared height and padding for title and search bars. */
export const EXPLORER_BAR_HEIGHT_CLASS = "min-h-14";

export function ExplorerBar({
  children,
  className,
  edge = "bottom",
}: {
  children: ReactNode;
  className?: string;
  edge?: "top" | "bottom" | "none";
}) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center px-5 py-3",
        EXPLORER_BAR_HEIGHT_CLASS,
        edge === "bottom" && "border-b border-border/20",
        edge === "top" && "border-t border-border/20",
        className,
      )}
    >
      {children}
    </div>
  );
}
