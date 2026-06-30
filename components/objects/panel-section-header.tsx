import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PanelSectionHeader({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </h3>
  );
}
