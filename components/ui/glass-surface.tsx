import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Frost layer: always pairs tint + blur. Uses a higher-opacity fallback when
 * backdrop-filter is unavailable so panels stay readable.
 */
export const glassPanelFrostClasses = cn(
  "pointer-events-none absolute inset-0 z-0",
  "bg-background/92 dark:bg-zinc-950/90",
  "supports-[backdrop-filter]:bg-background/52 supports-[backdrop-filter]:backdrop-blur-lg supports-[backdrop-filter]:backdrop-saturate-150",
  "supports-[backdrop-filter]:dark:bg-zinc-950/42 supports-[backdrop-filter]:dark:backdrop-brightness-90",
);

/** @deprecated Use glassPanelFrostClasses for large panels. */
export const glassFrostClasses = glassPanelFrostClasses;

/** Backdrop dim + blur for modal overlays — never apply to dialog content. */
export const glassOverlayClasses = cn(
  "bg-background/60 dark:bg-zinc-950/70",
  "supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:backdrop-saturate-150",
);

/** Opaque panel surface for modal/dialog content (sharp text, no blur). */
export const dialogPanelClasses = cn(
  "border border-border/30 bg-card text-card-foreground shadow-xl",
);

/** Single-element glass (tooltips, small portaled popovers). */
export const glassPopoverClasses = cn(
  "border border-border/30 shadow-xl",
  "bg-background/90 dark:bg-zinc-950/88",
  "supports-[backdrop-filter]:bg-background/35 supports-[backdrop-filter]:backdrop-blur-2xl supports-[backdrop-filter]:backdrop-saturate-150",
  "supports-[backdrop-filter]:dark:bg-zinc-950/28 supports-[backdrop-filter]:dark:backdrop-brightness-90",
);

export const glassSurfaceVariants = cva("relative isolate min-h-0 min-w-0", {
  variants: {
    variant: {
      panel: "overflow-visible",
      popover: "overflow-hidden rounded-lg border border-border/30 shadow-xl",
      chip: "overflow-hidden rounded-lg border border-border/25 shadow-md",
    },
  },
  defaultVariants: {
    variant: "panel",
  },
});

const frostRadius: Record<
  NonNullable<VariantProps<typeof glassSurfaceVariants>["variant"]>,
  string
> = {
  panel: "",
  popover: "rounded-lg",
  chip: "rounded-lg",
};

const frostClasses: Record<
  NonNullable<VariantProps<typeof glassSurfaceVariants>["variant"]>,
  string
> = {
  panel: glassPanelFrostClasses,
  popover: glassPopoverClasses,
  chip: glassPanelFrostClasses,
};

export function GlassSurface({
  children,
  className,
  variant,
  contentClassName,
  ...props
}: ComponentProps<"div"> &
  VariantProps<typeof glassSurfaceVariants> & {
    contentClassName?: string;
  }) {
  const v = variant ?? "panel";

  return (
    <div
      className={cn(glassSurfaceVariants({ variant: v }), className)}
      {...props}
    >
      <div className={cn(frostClasses[v], frostRadius[v])} aria-hidden />
      <div className={cn("relative z-[1] min-h-0 min-w-0", contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export function GlassChip({
  children,
  className,
  ...props
}: ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <GlassSurface variant="chip" className={className} {...props}>
      {children}
    </GlassSurface>
  );
}
