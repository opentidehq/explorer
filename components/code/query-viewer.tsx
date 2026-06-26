"use client";

import { CodeBlock } from "./code-block";

const LANG_MAP: Record<string, string> = {
  defender_for_endpoint: "javascript",
  sentinel: "sql",
  splunk: "bash",
  elastic: "sql",
  powershell: "powershell",
};

interface QueryViewerProps {
  platform: string;
  query: string;
}

export function QueryViewer({ platform, query }: QueryViewerProps) {
  const language = LANG_MAP[platform] ?? "sql";
  return <CodeBlock code={query} language={language} />;
}
