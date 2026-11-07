"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@/components/ui/markdown";
import { SEVERITY_NAMES, type Diagnostic } from "@/lib/lsp/protocol";
import { cn } from "@/lib/utils";

export interface HoverState {
  /** The token's box on screen, where the card points. */
  anchor: DOMRect;
  diagnostics: Diagnostic[];
  /** The server's hover, as Markdown; null when it has none, undefined while it is asked. */
  markdown: string | null | undefined;
}

const SEVERITY_DOT: Record<number, string> = {
  1: "bg-[var(--tide-code-error)]",
  2: "bg-[var(--tide-code-warn)]",
  3: "bg-[var(--tide-code-info)]",
  4: "bg-[var(--tide-code-info)]",
};

/**
 * What the language server says about a token: its findings there, then its hover. One card
 * per panel, placed below the token (above it near the bottom of the window), in a portal so
 * the panel's scrolling does not clip it.
 */
export function HoverCard({
  state,
  onPointerEnter,
  onPointerLeave,
}: {
  state: HoverState;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const { anchor } = state;
    const gap = 6;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const below = anchor.bottom + gap;
    const top =
      below + height > window.innerHeight - 8 && anchor.top - gap - height > 8
        ? anchor.top - gap - height
        : below;
    const left = Math.max(
      8,
      Math.min(anchor.left, window.innerWidth - width - 8),
    );
    setPlace({ top, left });
  }, [state]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "tide-scroll fixed z-[200] max-h-[min(22rem,60vh)] w-max max-w-[min(30rem,calc(100vw-16px))] overflow-y-auto rounded-xl border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-ink shadow-float",
        place ? "tide-fade-slide" : "invisible",
      )}
      style={place ?? { top: 0, left: 0 }}
    >
      {state.diagnostics.length ? (
        <ul className="space-y-1.5">
          {state.diagnostics.map((d, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 translate-y-[-1px] rounded-full",
                  SEVERITY_DOT[d.severity],
                )}
              />
              <span className="min-w-0">
                <span className="sr-only">{SEVERITY_NAMES[d.severity]}: </span>
                {d.message}
                {d.code ? (
                  <span className="ml-1.5 font-mono text-[10.5px] text-subtle">
                    {d.code}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {state.diagnostics.length && state.markdown ? (
        <hr className="my-2 border-line" />
      ) : null}
      {state.markdown ? (
        <Markdown className="lsp-hover text-xs">{state.markdown}</Markdown>
      ) : null}
      {state.markdown === undefined && !state.diagnostics.length ? (
        <span className="text-subtle">…</span>
      ) : null}
    </div>,
    document.body,
  );
}
