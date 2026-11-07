"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import {
  useCatalog,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { Section } from "@/components/explorer/inspector/object-overview";
import {
  useLanguageServerStatus,
  useObjectAnalysis,
} from "@/components/code/use-object-analysis";
import { isEmbeddedSignal } from "@/lib/explorer/object-file";
import { SIGNAL_OBJECTIVE_KEY } from "@/lib/opentide/graph";
import {
  countBySeverity,
  SEVERITY_NAMES,
  sortDiagnostics,
  type Diagnostic,
  type Severity,
} from "@/lib/lsp/protocol";
import { languageService } from "@/lib/lsp/service";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";
import { cn } from "@/lib/utils";

/** How many findings the server reported for an object, once it has analysed it. */
export function useFindingCount(uuid: string): number | null {
  const service = languageService();
  return useSyncExternalStore(
    service.subscribe,
    () => service.peek(uuid)?.analysis.diagnostics.length ?? null,
    () => null,
  );
}

const GROUPS: Array<{ severity: Severity[]; label: string }> = [
  { severity: [1], label: "errors" },
  { severity: [2], label: "warnings" },
  { severity: [3, 4], label: "notes" },
];

const ICONS: Record<Severity, typeof CircleAlert> = {
  1: CircleAlert,
  2: TriangleAlert,
  3: Info,
  4: Info,
};

const TONES: Record<Severity, string> = {
  1: "text-danger",
  2: "text-warn",
  3: "text-accent",
  4: "text-accent",
};

function Finding({
  diagnostic,
  line,
  onReveal,
}: {
  diagnostic: Diagnostic;
  line: string | undefined;
  onReveal: () => void;
}) {
  const Icon = ICONS[diagnostic.severity];
  const { start } = diagnostic.range;
  return (
    <li>
      <button
        type="button"
        onClick={onReveal}
        className="group flex w-full items-start gap-2.5 rounded-xl border border-line bg-panel px-3 py-2 text-left transition-colors hover:border-accent/45"
      >
        <Icon
          className={cn("mt-0.5 size-3.5 shrink-0", TONES[diagnostic.severity])}
          aria-label={SEVERITY_NAMES[diagnostic.severity]}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] leading-snug text-ink">
            {diagnostic.message}
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[10.5px] text-subtle">
            {diagnostic.code ? (
              <span className="text-muted">{diagnostic.code}</span>
            ) : null}
            <span>
              line {start.line + 1}:{start.character + 1}
            </span>
          </span>
          {line?.trim() ? (
            <span className="mt-1 block truncate font-mono text-[11px] text-subtle group-hover:text-muted">
              {line.trim()}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * What the opentide language server finds in the object, run in the browser: schema
 * findings, references, and every embedded query checked in its own language. A finding
 * opens the File tab at its line.
 */
export function ObjectChecks({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const { summaries } = useCatalog();
  const actions = useExplorerActions();
  const status = useLanguageServerStatus();
  const embedded = isEmbeddedSignal(
    summary,
    body,
    (id) => summaries.get(id)?.type === "objective",
  );
  const { document, analysis, error } = useObjectAnalysis(
    summary,
    body,
    !embedded,
  );
  const lines = useMemo(() => document?.text.split("\n") ?? [], [document]);
  const sorted = useMemo(
    () => sortDiagnostics(analysis?.diagnostics ?? []),
    [analysis],
  );

  if (embedded) {
    const objective =
      typeof body[SIGNAL_OBJECTIVE_KEY] === "string"
        ? (body[SIGNAL_OBJECTIVE_KEY] as string)
        : typeof body["parent"] === "string"
          ? (body["parent"] as string)
          : null;
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        An embedded signal is part of its objective&apos;s file, and is checked
        with it.{" "}
        {objective && summaries.has(objective) ? (
          <button
            type="button"
            onClick={() => actions.select(objective, { tab: "checks" })}
            className="text-accent underline-offset-2 hover:underline"
          >
            Check {summaries.get(objective)!.name}
          </button>
        ) : null}
      </p>
    );
  }

  if (error || status.state === "unavailable") {
    const reason =
      status.state === "unavailable" ? status.reason : (error ?? "");
    return (
      <div className="space-y-2 text-[13px] leading-relaxed text-muted">
        <p>
          The opentide language server is not available here, so this object was
          not checked.
        </p>
        <p className="font-mono text-[11px] text-subtle">{reason}</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-3" aria-busy>
        <p className="text-[12.5px] text-subtle">
          {status.state === "ready"
            ? "Checking…"
            : "Starting the opentide language server in your browser…"}
        </p>
        <div className="h-16 rounded-xl bg-hover motion-safe:animate-pulse" />
        <div className="h-16 rounded-xl bg-hover motion-safe:animate-pulse" />
      </div>
    );
  }

  const counts = countBySeverity(sorted);
  const server =
    status.state === "ready"
      ? `${status.server.name} ${status.server.version}`
      : "opentide-lsp";

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {sorted.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <CircleCheck className="size-4 text-accent" aria-hidden />
              No findings
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-danger">
                <CircleAlert className="size-3.5" aria-hidden />
                {counts.error} error{counts.error === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1 text-warn">
                <TriangleAlert className="size-3.5" aria-hidden />
                {counts.warning} warning{counts.warning === 1 ? "" : "s"}
              </span>
              {counts.info + counts.hint ? (
                <span className="inline-flex items-center gap-1 text-accent">
                  <Info className="size-3.5" aria-hidden />
                  {counts.info + counts.hint} note
                  {counts.info + counts.hint === 1 ? "" : "s"}
                </span>
              ) : null}
            </>
          )}
        </p>
        <p className="font-mono text-[10.5px] leading-relaxed text-subtle">
          {server} · WebAssembly, in your browser · the object as exported (the
          YAML in the file tab)
        </p>
      </div>

      {GROUPS.map((group) => {
        const items = sorted.filter((d) => group.severity.includes(d.severity));
        if (!items.length) return null;
        return (
          <Section
            key={group.label}
            label={group.label}
            aside={String(items.length)}
          >
            <ul className="space-y-1.5">
              {items.map((diagnostic, i) => (
                <Finding
                  key={`${diagnostic.range.start.line}:${diagnostic.range.start.character}:${i}`}
                  diagnostic={diagnostic}
                  line={lines[diagnostic.range.start.line]}
                  onReveal={() =>
                    actions.revealInFile(diagnostic.range.start.line)
                  }
                />
              ))}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
