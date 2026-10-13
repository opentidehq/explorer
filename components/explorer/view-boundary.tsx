"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

interface ViewBoundaryProps {
  /** What failed, in the reader's words: "this view", "this object". */
  what: string;
  /** A new key (another view, another object) tries again. */
  resetKey?: unknown;
  children: ReactNode;
}

/**
 * Keeps one part's failure from blanking the explorer: a corpus object the code did not
 * expect shows a notice where it would have drawn, and the rest stays usable.
 */
export class ViewBoundary extends Component<
  ViewBoundaryProps,
  { error: Error | null; key: unknown }
> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ViewBoundaryProps,
    state: { error: Error | null; key: unknown },
  ) {
    return Object.is(props.resetKey, state.key)
      ? null
      : { error: null, key: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <p className="text-base font-semibold tracking-[-0.01em]">
          Something in {this.props.what} could not be drawn
        </p>
        <p className="max-w-sm font-mono text-[11px] text-subtle">
          {error.message}
        </p>
        <button
          type="button"
          className="tide-btn-secondary mt-1"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
