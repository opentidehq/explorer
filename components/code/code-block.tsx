"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHighlighter, themeForMode } from "@/lib/shiki/highlighter";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({
  code,
  language = "yaml",
  className,
  showLineNumbers = true,
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
          "overflow-x-auto p-4 font-mono text-sm [&_pre]:!bg-transparent [&_code]:font-mono",
          showLineNumbers && "[&_pre]:pl-2",
        )}
        dangerouslySetInnerHTML={{
          __html: html || `<pre><code>${code}</code></pre>`,
        }}
      />
    </div>
  );
}
