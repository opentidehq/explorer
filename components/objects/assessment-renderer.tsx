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

export { SurfaceField } from "@/components/objects/field-value-renderer";

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

  const visible = FIELD_REGISTRY[summary.type]
    .filter((field) => assessmentPathSet.has(field.path))
    .map((field) => ({
      field,
      value: resolveFieldValue(enrichedBody, field.path),
    }))
    .filter(({ value }) => {
      if (value == null || value === "") return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    });

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
