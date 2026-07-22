import { cn } from "@/lib/utils";

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
