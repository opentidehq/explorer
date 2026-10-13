"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/** One button; the icon follows the theme in CSS, so it is right before hydration. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="tide-pill-icon relative"
    >
      <Sun
        className="size-4 transition-[opacity,rotate,scale] duration-500 dark:rotate-90 dark:scale-50 dark:opacity-0"
        aria-hidden
      />
      <Moon
        className="absolute size-4 -rotate-90 scale-50 opacity-0 transition-[opacity,rotate,scale] duration-500 dark:rotate-0 dark:scale-100 dark:opacity-100"
        aria-hidden
      />
    </button>
  );
}
