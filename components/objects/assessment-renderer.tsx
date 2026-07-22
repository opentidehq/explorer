"use client";

import { useExplorer } from "@/components/shell/explorer-context";
import {
  FIELD_REGISTRY,
  resolveFieldValue,
} from "@/lib/opentide/field-registry";
import {
  buildEnrichedBody,
  getAssessmentPaths,
} from "@/lib/opentide/metadata-fields";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";
import { FieldRow } from "@/components/objects/field-value-renderer";

export function SchemaAssessment({
  summary,
  body,
}: {
  summary: BundleObjectSummary;
  body: ObjectBody;
}) {
  const { vocabIndex } = useExplorer();

  const enrichedBody = buildEnrichedBody(summary, body);
  const assessmentPathSet = new Set(getAssessmentPaths(summary.type));

  const visible: Array<{
    field: (typeof FIELD_REGISTRY)[typeof summary.type][number];
    value: unknown;
  }> = [];

  for (const field of FIELD_REGISTRY[summary.type]) {
    if (!assessmentPathSet.has(field.path)) continue;
    const value = resolveFieldValue(enrichedBody, field.path);
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    visible.push({ field, value });
  }

  if (!visible.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No assessment fields for this object.
      </p>
    );
  }

  return (
    <dl className="space-y-4">
      {visible.map(({ field, value }) => (
        <FieldRow
          key={field.path}
          field={field}
          value={value}
          vocab={vocabIndex}
        />
      ))}
    </dl>
  );
}
