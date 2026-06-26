import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark-dimmed", "github-light"],
      langs: ["yaml", "sql", "powershell", "javascript", "bash"],
    });
  }
  return highlighterPromise;
}

export function themeForMode(isDark: boolean) {
  return isDark ? "github-dark-dimmed" : "github-light";
}
