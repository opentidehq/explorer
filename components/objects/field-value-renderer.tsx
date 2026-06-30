"use client";

import { type ComponentType } from "react";
import {
  AlertTriangle,
  BookOpen,
  Crosshair,
  ExternalLink,
  Fingerprint,
  Gauge,
  Globe,
  Layers,
  Link2,
  Shield,
  Swords,
  Tag,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { FieldDefinition } from "@/lib/opentide/field-registry";
import { VocabTooltip } from "@/components/ui/vocab-tooltip";
import {
  formatActorFallbackLabel,
  formatVocabDisplayName,
  findSurfaceTermsInText,
  flattenReferences,
  lookupVocabTerm,
  normalizeReference,
  parseTerrainMarkdown,
  splitPillValues,
  type VocabIndex,
} from "@/lib/opentide/vocab";
import { cn } from "@/lib/utils";

const FIELD_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  criticality: AlertTriangle,
  severity: Gauge,
  impact: Shield,
  leverage: TrendingUp,
  viability: Crosshair,
  killchain: Layers,
  "threat.surface": Globe,
  "threat.terrain": Globe,
  "threat.actors": Users,
  "threat.att&ck": Target,
  "metadata.tlp": Tag,
  "metadata.schema": Fingerprint,
  "metadata.version": Tag,
  "objective.priority": AlertTriangle,
  "objective.type": Crosshair,
  "objective.investment": TrendingUp,
  "objective.attack": Target,
  "objective.composition.description": Layers,
  methodology: Crosshair,
  effort: Gauge,
  entities: Users,
  author: Fingerprint,
  "metadata.author": Fingerprint,
  description: BookOpen,
  detection_model: Crosshair,
  "response.procedure.analysis": Shield,
  "response.procedure.containment": Shield,
  references: Link2,
  _platforms: Swords,
  _status: Tag,
  "data.availability": Globe,
  "data.requirements": Globe,
};

export function FieldRow({
  field,
  value,
  vocab,
}: {
  field: FieldDefinition;
  value: unknown;
  vocab: VocabIndex;
}) {
  if (!field?.path) return null;

  const Icon = FIELD_ICONS[field.path] ?? FIELD_ICONS[field.vocab ?? ""] ?? Tag;

  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        {field.label}
      </dt>
      <dd className="mt-1.5">
        <FieldValue field={field} value={value} vocab={vocab} />
      </dd>
    </div>
  );
}

export function FieldValue({
  field,
  value,
  vocab,
}: {
  field: FieldDefinition;
  value: unknown;
  vocab: VocabIndex;
}) {
  if (field.format === "attack" && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <a
            key={String(t)}
            href={`https://attack.mitre.org/techniques/${String(t).replace(".", "/")}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
          >
            {String(t)}
            <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    );
  }

  if (field.format === "references") {
    const refs = flattenReferences(value)
      .map((ref) => normalizeReference(ref))
      .filter((ref): ref is NonNullable<typeof ref> => ref != null);

    if (!refs.length) {
      return (
        <span className="text-sm text-muted-foreground">
          No valid references.
        </span>
      );
    }

    return (
      <ul className="space-y-1">
        {refs.map((ref, i) => (
          <li key={`${ref.url}-${i}`}>
            <a
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline"
            >
              {ref.label}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    );
  }

  if (field.format === "markdown" && typeof value === "string") {
    return (
      <div className="markdown-content min-w-0 max-w-full text-sm leading-relaxed text-foreground/90">
        <ReactMarkdown>{value}</ReactMarkdown>
      </div>
    );
  }

  if (field.format === "surface" && typeof value === "string") {
    return (
      <SurfaceField value={value} vocabKey={field.vocab} vocabIndex={vocab} />
    );
  }

  if (field.format === "surface" && Array.isArray(value) && value.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((pill) => (
          <VocabPill
            key={String(pill)}
            value={String(pill)}
            vocabKey={field.vocab}
            vocabIndex={vocab}
          />
        ))}
      </div>
    );
  }

  if (field.format === "pills") {
    const pills = splitPillValues(value);
    return (
      <div className="flex flex-wrap gap-1.5">
        {pills.map((pill) => (
          <VocabPill
            key={pill}
            value={pill}
            vocabKey={field.vocab}
            vocabIndex={vocab}
          />
        ))}
      </div>
    );
  }

  return (
    <span className="whitespace-pre-wrap text-sm leading-relaxed">
      {String(value)}
    </span>
  );
}

export function SurfaceField({
  value,
  vocabKey,
  vocabIndex,
}: {
  value: string;
  vocabKey?: string;
  vocabIndex: VocabIndex;
}) {
  const { narrative, scopes, inlinePaths } = parseTerrainMarkdown(value);
  const vocabMatches = findSurfaceTermsInText(vocabIndex, value);
  const scopedFromLines = scopes.flatMap((scope) => scope.values);
  const surfacePills = [
    ...new Set([...scopedFromLines, ...inlinePaths, ...vocabMatches]),
  ];
  const hasStructuredScopes = scopes.length > 0;
  const hasSurfacePills = surfacePills.length > 0;

  return (
    <div className="space-y-3">
      {hasStructuredScopes ? (
        <div className="space-y-2">
          {scopes.map((scope) => (
            <div key={scope.kind}>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {scope.kind}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {scope.values.map((pill) => (
                  <VocabPill
                    key={`${scope.kind}-${pill}`}
                    value={pill}
                    vocabKey={vocabKey}
                    vocabIndex={vocabIndex}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : hasSurfacePills ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Surface
          </p>
          <div className="flex flex-wrap gap-1.5">
            {surfacePills.map((pill) => (
              <VocabPill
                key={pill}
                value={pill}
                vocabKey={vocabKey}
                vocabIndex={vocabIndex}
              />
            ))}
          </div>
        </div>
      ) : null}
      {narrative ? (
        <details className="group">
          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-dotted underline-offset-2 group-open:no-underline">
              Terrain description
            </span>
          </summary>
          <div className="markdown-content mt-2 min-w-0 max-w-full text-sm leading-relaxed text-foreground/90">
            <ReactMarkdown>{narrative}</ReactMarkdown>
          </div>
        </details>
      ) : !hasSurfacePills ? (
        <div className="markdown-content min-w-0 max-w-full text-sm leading-relaxed text-foreground/90">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}

function VocabPill({
  value,
  vocabKey,
  vocabIndex,
}: {
  value: string;
  vocabKey?: string;
  vocabIndex: VocabIndex;
}) {
  const term = vocabKey
    ? lookupVocabTerm(vocabIndex, vocabKey, value)
    : undefined;
  const display = term
    ? formatVocabDisplayName(term.name)
    : formatActorFallbackLabel(value);
  const aliases = term?.aliases?.filter(
    (alias) => alias.toLowerCase() !== display.toLowerCase(),
  );
  const tooltipDescription = [
    term?.description?.trim(),
    aliases?.length
      ? `Also known as: ${aliases.slice(0, 8).join(", ")}${aliases.length > 8 ? "…" : ""}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  const className = cn(
    "inline-flex max-w-full items-center gap-1 rounded-full border border-border/50",
    "bg-muted/25 px-2.5 py-0.5 text-[11px] leading-snug text-foreground/90",
    "transition-colors hover:border-primary/40 hover:bg-primary/10",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
  );

  const content = (
    <>
      <Tag className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
      <span className="truncate">{display}</span>
      {term?.link ? (
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" aria-hidden />
      ) : null}
    </>
  );

  const pill = term?.link ? (
    <a
      href={term.link}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </a>
  ) : (
    <button type="button" className={className}>
      {content}
    </button>
  );

  return (
    <VocabTooltip label={display} description={tooltipDescription || undefined}>
      {pill}
    </VocabTooltip>
  );
}
