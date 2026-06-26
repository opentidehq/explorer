import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark-dimmed"],
      langs: ["yaml", "sql", "powershell", "javascript", "bash"],
    });
  }
  return highlighterPromise;
}

export const EXPLORER_THEME = "github-dark-dimmed";
