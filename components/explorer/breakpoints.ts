/**
 * The desktop breakpoint: at and above it the rail and the inspector are panels beside the
 * stage; below it they are a drawer and a sheet that cover it.
 */
export const DESKTOP = "(min-width: 1024px)";

/** Whether the explorer is laid out for the desktop now (always, outside a browser). */
export function isDesktop(): boolean {
  return typeof window === "undefined" || window.matchMedia(DESKTOP).matches;
}
