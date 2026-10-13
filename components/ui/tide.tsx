"use client";

import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { TYPE_COLOR_VAR, TYPE_ICONS } from "@/lib/graph/type-icons";
import type { ObjectType } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

/**
 * The explorer's small vocabulary, after opentide.org's landing UI: tags in four tones,
 * lowercase mono captions, type icons in tinted squares, and a segmented control.
 */

export type TagTone = "solid" | "accent" | "outline" | "dashed";

const TONE: Record<TagTone, string> = {
  solid: "bg-accent text-accent-fg",
  accent: "bg-accent/12 text-accent",
  outline: "border border-line text-muted",
  dashed: "border border-dashed border-ink/25 text-subtle",
};

/** Status and capability tags. Four tones, used the same way everywhere. */
export function Tag({
  tone = "outline",
  children,
  className,
  title,
}: {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px] leading-4",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small lowercase mono caption above a list or a figure. */
export function Caption({
  children,
  className,
  as: As = "p",
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "span" | "h3" | "h4" | "dt";
}) {
  return (
    <As
      className={cn("font-mono text-[11px] leading-4 text-subtle", className)}
    >
      {children}
    </As>
  );
}

/** A numbered section label: `01 — label`, as the site heads its chapters. */
export function SectionLabel({
  n,
  children,
  aside,
  className,
}: {
  n?: number;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 font-mono text-[11px]",
        className,
      )}
    >
      {n != null ? (
        <>
          <span className="font-semibold text-accent">
            {String(n).padStart(2, "0")}
          </span>
          <span aria-hidden className="h-px w-4 bg-line" />
        </>
      ) : null}
      <span className="text-subtle">{children}</span>
      {aside ? <span className="ml-auto text-subtle">{aside}</span> : null}
    </div>
  );
}

const ICON_SIZES = {
  xs: { box: "size-5 rounded-md", icon: "size-3" },
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-7 rounded-lg", icon: "size-4" },
  lg: { box: "size-10 rounded-xl", icon: "size-5" },
} as const;

/** A type's icon in a square tinted with the type's colour; solid when active. */
export function TypeIcon({
  type,
  size = "sm",
  active = false,
  className,
}: {
  type: ObjectType;
  size?: keyof typeof ICON_SIZES;
  active?: boolean;
  className?: string;
}) {
  const Icon = TYPE_ICONS[type];
  const color = TYPE_COLOR_VAR[type];
  const style: CSSProperties = active
    ? { backgroundColor: color, color: "var(--tide-panel)" }
    : {
        backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`,
        color,
      };
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "grid shrink-0 place-items-center transition-colors duration-300",
        ICON_SIZES[size].box,
        className,
      )}
    >
      <Icon className={ICON_SIZES[size].icon} strokeWidth={2} />
    </span>
  );
}

/** A dot in a type's colour, for legends and dense lists. */
export function TypeDot({
  type,
  className,
}: {
  type: ObjectType;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: TYPE_COLOR_VAR[type] }}
    />
  );
}

export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-panel px-1 font-mono text-[10.5px] text-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A vocabulary value that breaks only after its `::` separators, never inside a word. */
export function VocabValue({ value }: { value: string }) {
  const parts = value.split("::");
  return parts.map((part, k) => (
    <Fragment key={k}>
      {k > 0 && <wbr />}
      <span className="whitespace-nowrap">
        {part}
        {k < parts.length - 1 && "::"}
      </span>
    </Fragment>
  ));
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Visually hide the label below `sm` (it stays readable to assistive tech). */
  compactLabel?: boolean;
}

/**
 * A pill segmented control. The highlight slides to the chosen option. Used as a tab list
 * (`role="tablist"`) or a toggle group.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  role = "tablist",
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  role?: "tablist" | "group";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<T, HTMLButtonElement>());
  const [mark, setMark] = useState<{ x: number; w: number } | null>(null);

  const measure = useCallback(() => {
    const el = optionRefs.current.get(value);
    if (el) setMark({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = options.findIndex((option) => option.value === value);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    optionRefs.current.get(next.value)?.focus();
  };

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("tide-segment", className)}
    >
      {mark ? (
        <span
          aria-hidden
          className="tide-segment-mark"
          style={{ width: mark.w, transform: `translateX(${mark.x}px)` }}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) optionRefs.current.set(option.value, node);
              else optionRefs.current.delete(option.value);
            }}
            type="button"
            role={role === "tablist" ? "tab" : undefined}
            aria-selected={role === "tablist" ? selected : undefined}
            aria-pressed={role === "group" ? selected : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "tide-segment-option font-medium",
              size === "md"
                ? "h-8 px-3 text-[13px]"
                : "h-6 px-2.5 font-mono text-[11px]",
              // Before the first measure, the chosen option carries its own fill.
              !mark &&
                selected &&
                "bg-panel shadow-[0_0_0_1px_var(--tide-border)]",
            )}
          >
            {Icon ? (
              <Icon className={size === "md" ? "size-3.5" : "size-3"} />
            ) : null}
            <span
              className={
                option.compactLabel ? "sr-only sm:not-sr-only" : undefined
              }
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
