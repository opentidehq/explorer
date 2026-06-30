"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

export function ResizeHandle({
  direction,
  onResize,
  onResizeEnd,
  className,
}: {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  className?: string;
}) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const pos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onResize(delta);
    },
    [direction, onResize],
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    onResizeEnd?.();
  }, [onResizeEnd]);

  return (
    <div
      role="separator"
      aria-orientation={direction}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      className={cn(
        "group relative z-20 shrink-0 touch-none bg-border/15 transition-colors hover:bg-primary/25 active:bg-primary/35",
        direction === "horizontal"
          ? "w-1 cursor-col-resize"
          : "h-1.5 cursor-row-resize",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100",
          direction === "horizontal"
            ? "inset-y-0 -left-1 w-3"
            : "inset-x-0 -top-1 h-3",
        )}
        aria-hidden
      />
    </div>
  );
}
