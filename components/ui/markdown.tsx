"use client";

import { lazy, Suspense } from "react";
import type { Components } from "react-markdown";
import { safeMarkdownHref } from "@/lib/opentide/safe-href";
import { cn } from "@/lib/utils";

// Markdown only renders once an object is open; keep its parser out of the first load.
const ReactMarkdown = lazy(() => import("react-markdown"));

const components: Components = {
  a: ({ node: _node, href, ...props }) => {
    const safe = safeMarkdownHref(href);
    if (!safe) return <span {...props} />;
    return (
      <a {...props} href={safe} target="_blank" rel="noopener noreferrer" />
    );
  },
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
