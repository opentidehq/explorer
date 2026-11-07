"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Copy } from "lucide-react";
import { HoverCard, type HoverState } from "@/components/code/hover-card";
import { highlight, type HighlightLanguage } from "@/lib/code/highlight";
import {
  buildLines,
  fromLocalTokens,
  type LineToken,
} from "@/lib/code/segments";
import {
  countBySeverity,
  rangeContains,
  tokenKind,
  type Diagnostic,
  type Position,
  type SemanticToken,
} from "@/lib/lsp/protocol";
import { cn } from "@/lib/utils";

/**
 * What the language server says about the panel's code, in the panel's own coordinates.
 * Tokens replace the regex highlighter; diagnostics are underlined; hover asks the server.
 */
export interface PanelAnalysis {
  tokens: SemanticToken[] | null;
  diagnostics: Diagnostic[];
  hover?: (position: Position) => Promise<string | null>;
}

const HOVER_DELAY = 180;
const HOVER_GRACE = 160;

function serverLineTokens(
  tokens: readonly SemanticToken[],
  lineCount: number,
): LineToken[][] {
  const lines: LineToken[][] = Array.from({ length: lineCount }, () => []);
  for (const token of tokens) {
    lines[token.line]?.push({
      character: token.character,
      length: token.length,
      kind: tokenKind(token.type),
    });
  }
  return lines;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "2 errors · 1 warning": the findings in the panel, for its caption. */
export function findingsSummary(diagnostics: readonly Diagnostic[]): string {
  const counts = countBySeverity(diagnostics);
  return [
    counts.error ? plural(counts.error, "error") : "",
    counts.warning ? plural(counts.warning, "warning") : "",
    counts.info + counts.hint ? plural(counts.info + counts.hint, "note") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A deep-tide code panel for real artefacts — an object's YAML, a rule's query. Navy in both
 * themes, as on opentide.org. The regex highlighter paints at once; the language server's
 * analysis, when given, replaces it with semantic tokens, findings and hover.
 */
export function CodePanel({
  code,
  language,
  caption,
  aside,
  className,
  maxHeight = "28rem",
  lineNumbers = false,
  analysis,
  revealLine,
}: {
  code: string;
  language: HighlightLanguage;
  caption: ReactNode;
  aside?: ReactNode;
  className?: string;
  maxHeight?: string;
  lineNumbers?: boolean;
  analysis?: PanelAnalysis | null;
  /** A line (0-based) to scroll to and mark, e.g. a finding picked in the checks tab. */
  revealLine?: number | null;
}) {
  const local = useMemo(() => highlight(code, language), [code, language]);
  const serverTokens = analysis?.tokens ?? null;
  const diagnostics = useMemo(
    () => analysis?.diagnostics ?? [],
    [analysis?.diagnostics],
  );
  const lines = useMemo(
    () =>
      buildLines(
        code.replace(/\r\n?/g, "\n"),
        serverTokens
          ? serverLineTokens(serverTokens, local.length)
          : fromLocalTokens(local),
        diagnostics,
        serverTokens !== null,
      ),
    [code, local, serverTokens, diagnostics],
  );
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

  /* Hover ---------------------------------------------------------------------------- */

  // A card belongs to the lines it was opened on: new code or analysis hides it.
  const [hoverState, setHover] = useState<
    (HoverState & { owner: unknown }) | null
  >(null);
  const hover = hoverState?.owner === lines ? hoverState : null;
  const current = useRef<string | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const hoverFn = analysis?.hover;

  const close = useCallback(() => {
    window.clearTimeout(openTimer.current);
    current.current = null;
    setHover(null);
  }, []);
  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(close, HOVER_GRACE);
  }, [close]);
  const keepOpen = useCallback(() => {
    window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );
  // The card is fixed to the window: any scroll (the panel, the inspector) moves its token.
  useEffect(() => {
    if (!hover) return;
    const onScroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !document.querySelector('[role="tooltip"]')?.contains(event.target)
      )
        close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [hover, close]);

  const onPointerOver = (event: React.PointerEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-c]",
    );
    if (!target) {
      scheduleClose();
      return;
    }
    const line = Number(target.dataset.l);
    const character = Number(target.dataset.c);
    const key = `${line}:${character}`;
    keepOpen();
    if (current.current === key) return;
    current.current = key;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      const position = { line, character };
      const here = diagnostics.filter((d) => rangeContains(d.range, position));
      const wantsHover = target.dataset.t === "1" && hoverFn !== undefined;
      if (!here.length && !wantsHover) return;
      const anchor = target.getBoundingClientRect();
      setHover({
        anchor,
        diagnostics: here,
        markdown: wantsHover ? undefined : null,
        owner: lines,
      });
      if (!wantsHover) return;
      void hoverFn(position).then((markdown) => {
        if (current.current !== key) return;
        if (!markdown && !here.length) {
          setHover(null);
          return;
        }
        setHover({ anchor, diagnostics: here, markdown, owner: lines });
      });
    }, HOVER_DELAY);
  };

  /* Reveal --------------------------------------------------------------------------- */

  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (revealLine == null) return;
    preRef.current
      ?.querySelector<HTMLElement>(`[data-line="${revealLine}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [revealLine, lines]);

  const gutter = String(lines.length).length;
  const findings = findingsSummary(diagnostics);

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
          {findings ? (
            <span
              className={cn(
                "px-1.5",
                diagnostics.some((d) => d.severity === 1)
                  ? "gutter-1"
                  : diagnostics.some((d) => d.severity === 2)
                    ? "gutter-2"
                    : "gutter-3",
              )}
            >
              {findings}
            </span>
          ) : null}
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
        ref={preRef}
        className="tide-scroll m-0 overflow-auto py-3 font-mono text-[12px] leading-[1.65]"
        style={{ maxHeight }}
      >
        <code
          className="block min-w-max"
          onPointerOver={onPointerOver}
          onPointerLeave={scheduleClose}
        >
          {lines.map((line, i) => (
            <span
              key={i}
              data-line={i}
              className={cn(
                "flex px-4",
                revealLine === i && "line-reveal",
                !lineNumbers && line.severity && `line-diag-${line.severity}`,
              )}
            >
              {lineNumbers ? (
                <span
                  aria-hidden
                  className={cn(
                    "mr-4 shrink-0 select-none text-right",
                    line.severity
                      ? `gutter-${line.severity}`
                      : "text-code-dim/50",
                  )}
                  style={{ width: `${gutter}ch` }}
                >
                  {i + 1}
                </span>
              ) : null}
              <span className="whitespace-pre">
                {line.segments.length === 0 && !line.points.length ? " " : null}
                {line.segments.map((segment, k) => {
                  const points = line.points.filter(
                    (p) => p.character === segment.character,
                  );
                  const target = segment.token || segment.severity;
                  const node =
                    segment.kind === "plain" && !target ? (
                      segment.text
                    ) : (
                      <span
                        className={cn(
                          segment.kind !== "plain" && `tok-${segment.kind}`,
                          segment.severity && `diag diag-${segment.severity}`,
                        )}
                        data-l={target ? i : undefined}
                        data-c={target ? segment.character : undefined}
                        data-t={segment.token ? "1" : undefined}
                      >
                        {segment.text}
                      </span>
                    );
                  return points.length ? (
                    <span key={k}>
                      {points.map((p, n) => (
                        <span
                          key={n}
                          className={cn("diag-point", `gutter-${p.severity}`)}
                          data-l={i}
                          data-c={p.character}
                        />
                      ))}
                      {node}
                    </span>
                  ) : (
                    <Fragment key={k}>{node}</Fragment>
                  );
                })}
                {line.points
                  .filter(
                    (p) =>
                      !line.segments.some((s) => s.character === p.character),
                  )
                  .map((p, n) => (
                    <span
                      key={`end-${n}`}
                      className={cn("diag-point", `gutter-${p.severity}`)}
                      data-l={i}
                      data-c={p.character}
                    />
                  ))}
              </span>
            </span>
          ))}
        </code>
      </pre>
      {hover ? (
        <HoverCard
          state={hover}
          onPointerEnter={keepOpen}
          onPointerLeave={scheduleClose}
        />
      ) : null}
    </figure>
  );
}
