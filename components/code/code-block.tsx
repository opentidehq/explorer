"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHighlighter, themeForMode } from "@/lib/shiki/highlighter";
import { cn } from "@/lib/utils";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
  variant?: "default" | "plain";
}

export function CodeBlock({
  code,
  language = "yaml",
  className,
  showLineNumbers = true,
  variant = "default",
}: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const isDark = resolvedTheme !== "light";

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      const out = hl.codeToHtml(code, {
        lang: language,
        theme: themeForMode(isDark),
      });
      setHtml(out);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, isDark]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (variant === "plain") {
    return (
      <div className={cn("relative min-w-0", className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          className="absolute right-0 top-0 z-10 h-7 px-2"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
        <div
          className={cn(
            "overflow-x-auto py-1 pr-8 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_code]:font-mono [&_code]:break-words",
            showLineNumbers && "[&_pre]:pl-2",
          )}
          dangerouslySetInnerHTML={{
            __html: html || `<pre><code>${escapeHtml(code)}</code></pre>`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="font-mono text-xs uppercase text-muted-foreground">
          {language}
        </span>
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 px-2">
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div
        className={cn(
          "overflow-x-auto p-4 font-mono text-sm break-words whitespace-pre-wrap [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_code]:font-mono [&_code]:break-words",
          showLineNumbers && "[&_pre]:pl-2",
        )}
        dangerouslySetInnerHTML={{
          __html: html || `<pre><code>${escapeHtml(code)}</code></pre>`,
        }}
      />
    </div>
  );
}
