import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "outline" | "threat" | "objective" | "signal" | "rule";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variant === "default" && "border-transparent bg-muted text-foreground",
        variant === "outline" && "border-border text-muted-foreground",
        variant === "threat" && "border-threat/30 bg-threat/10 text-threat",
        variant === "objective" &&
          "border-objective/30 bg-objective/10 text-objective",
        variant === "signal" && "border-signal/30 bg-signal/10 text-signal",
        variant === "rule" && "border-rule/30 bg-rule/10 text-rule",
        className,
      )}
      {...props}
    />
  );
}
