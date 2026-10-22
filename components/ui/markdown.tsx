"use client";

import { lazy, Suspense } from "react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

// Markdown only renders once an object is open; keep its parser out of the first load.
const ReactMarkdown = lazy(() => import("react-markdown"));

const components: Components = {
  a: ({ node: _node, ...props }) => (
    // The link text arrives in `props.children`.
    // oxlint-disable-next-line jsx-a11y/anchor-has-content
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

/** Object prose: descriptions, terrain, procedures. Raw HTML is never rendered. */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown", className)}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{children}</p>}>
        <ReactMarkdown components={components}>{children}</ReactMarkdown>
      </Suspense>
    </div>
  );
}
