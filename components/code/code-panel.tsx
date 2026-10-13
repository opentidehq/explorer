"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { highlight, type HighlightLanguage } from "@/lib/code/highlight";
import { cn } from "@/lib/utils";

/**
 * A deep-tide code panel for real artefacts — an object's YAML, a rule's query. Navy in both
 * themes, as on opentide.org.
 */
export function CodePanel({
  code,
  language,
  caption,
  aside,
  className,
  maxHeight = "28rem",
  lineNumbers = false,
}: {
  code: string;
  language: HighlightLanguage;
  caption: ReactNode;
  aside?: ReactNode;
  className?: string;
  maxHeight?: string;
  lineNumbers?: boolean;
}) {
  const lines = useMemo(() => highlight(code, language), [code, language]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied: the code stays selectable.
    }
  };

  const gutter = String(lines.length).length;

  return (
    <figure
      className={cn(
        "tide-code m-0 flex min-w-0 flex-col overflow-hidden",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 pl-4 pr-1.5 font-mono text-[11px] text-code-dim">
        <span className="min-w-0 truncate">{caption}</span>
        <span className="flex shrink-0 items-center gap-1">
          {aside}
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Copied" : "Copy to clipboard"}
            className="inline-flex size-7 items-center justify-center rounded-md text-code-dim transition-colors hover:bg-white/10 hover:text-code-ink"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </span>
      </figcaption>
      <pre
        className="tide-scroll m-0 overflow-auto py-3 font-mono text-[12px] leading-[1.65]"
        style={{ maxHeight }}
      >
        <code className="block min-w-max">
          {lines.map((tokens, i) => (
            <span key={i} className="flex px-4">
              {lineNumbers ? (
                <span
                  aria-hidden
                  className="mr-4 shrink-0 select-none text-right text-code-dim/50"
                  style={{ width: `${gutter}ch` }}
                >
                  {i + 1}
                </span>
              ) : null}
              <span className="whitespace-pre">
                {tokens.length === 0
                  ? " "
                  : tokens.map((token, k) =>
                      token.kind === "plain" ? (
                        token.text
                      ) : (
                        <span key={k} className={`tok-${token.kind}`}>
                          {token.text}
                        </span>
                      ),
                    )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
