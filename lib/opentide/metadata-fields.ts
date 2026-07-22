import {
  FIELD_REGISTRY,
  resolveFieldValue,
  type FieldDefinition,
} from "@/lib/opentide/field-registry";
import { getType, parents, type GraphContext } from "@/lib/opentide/graph";
import type {
  BundleObjectSummary,
  ObjectBody,
  ObjectType,
} from "@/lib/opentide/types";

/** Registry paths rendered in the shared metadata section (not assessment). */
const METADATA_PATHS: Record<ObjectType, readonly string[]> = {
  threat: ["metadata.tlp", "metadata.schema", "metadata.version", "references"],
  objective: [
    "metadata.tlp",
    "objective.type",
    "objective.priority",
    "objective.investment",
    "objective.composition.strategy",
    "objective.attack",
  ],
  signal: ["metadata.schema", "metadata.version"],
  rule: [
    "metadata.tlp",
    "metadata.schema",
    "metadata.version",
    "metadata.created",
    "metadata.modified",
    "metadata.author",
    "_status",
    "references",
    "detection_model",
  ],
};

/** Registry paths rendered in the left Description column — not Analysis. */
const DESCRIPTION_PANEL_PATHS: Partial<Record<ObjectType, readonly string[]>> =
  {
    rule: ["description"],
  };

/** Objective fields surfaced on signals as inherited metadata. */
const SIGNAL_INHERITED_PATHS: readonly string[] = [
  "metadata.tlp",
  "objective.type",
  "objective.priority",
  "objective.investment",
  "objective.composition.strategy",
  "objective.attack",
];

export interface MetadataFieldEntry {
  field: FieldDefinition;
  value: unknown;
  inherited?: boolean;
  inheritedFrom?: string;
}

export interface ParentObjectiveRef {
  id: string;
  name: string;
}

export function buildEnrichedBody(
  summary: BundleObjectSummary,
  body: ObjectBody,
): Record<string, unknown> {
  const bodyMetadata = (body["metadata"] as ObjectBody | undefined) ?? {};

  return {
    ...body,
    _status: summary.status,
    ...(summary.type === "rule" && summary.techniques.length > 0
      ? { _techniques: summary.techniques }
      : {}),
    metadata: {
      ...bodyMetadata,
      ...(summary.schema != null ? { schema: summary.schema } : {}),
      ...(summary.version != null ? { version: summary.version } : {}),
      ...(summary.tlp != null ? { tlp: summary.tlp } : {}),
    },
  };
}

function fieldByPath(
  type: ObjectType,
  path: string,
): FieldDefinition | undefined {
  return FIELD_REGISTRY[type].find((field) => field.path === path);
}

function hasDisplayValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function collectFields(
  type: ObjectType,
  enrichedBody: Record<string, unknown>,
  paths: readonly string[],
  inherited?: { from: string },
): MetadataFieldEntry[] {
  const entries: MetadataFieldEntry[] = [];

  for (const path of paths) {
    const field = fieldByPath(type, path) ?? fieldByPath("objective", path);
    if (!field) continue;

    const value = resolveFieldValue(enrichedBody, path);
    if (!hasDisplayValue(value)) continue;

    entries.push({
      field,
      value,
      ...(inherited ? { inherited: true, inheritedFrom: inherited.from } : {}),
    });
  }

  return entries;
}

function resolveParentObjective(
  ctx: GraphContext,
  flatIndex: Record<string, ObjectBody>,
  signalId: string,
): ParentObjectiveRef | null {
  for (const parentId of parents(ctx, signalId)) {
    if (getType(ctx, parentId, true) !== "objective") continue;
    const body = flatIndex[parentId] ?? ctx.models.objective[parentId];
    if (!body) continue;
    const name = typeof body["name"] === "string" ? body["name"] : parentId;
    return { id: parentId, name };
  }
  return null;
}

export function getMetadataFields(
  summary: BundleObjectSummary,
  body: ObjectBody,
  options?: {
    graphContext?: GraphContext;
    flatIndex?: Record<string, ObjectBody>;
    getSummary?: (uuid: string) => BundleObjectSummary | undefined;
  },
): {
  entries: MetadataFieldEntry[];
  parentObjective: ParentObjectiveRef | null;
  platforms: string[];
  platformsInherited: boolean;
} {
  const enrichedBody = buildEnrichedBody(summary, body);
  const metadataPaths = METADATA_PATHS[summary.type];
  let entries = collectFields(summary.type, enrichedBody, metadataPaths);
  let parentObjective: ParentObjectiveRef | null = null;
  let platforms = summary.platforms;
  let platformsInherited = false;

  if (summary.type === "signal" && options?.graphContext && options.flatIndex) {
    parentObjective = resolveParentObjective(
      options.graphContext,
      options.flatIndex,
      summary.uuid,
    );

    if (parentObjective) {
      const objectiveBody =
        options.flatIndex[parentObjective.id] ??
        options.graphContext.models.objective[parentObjective.id];
      const objectiveSummary = options.getSummary?.(parentObjective.id);
      const objectiveEnriched = objectiveSummary
        ? buildEnrichedBody(objectiveSummary, objectiveBody ?? {})
        : (objectiveBody ?? {});

      const inheritedEntries = collectFields(
        "objective",
        objectiveEnriched as Record<string, unknown>,
        SIGNAL_INHERITED_PATHS,
        { from: parentObjective.name },
      );

      const nativePaths = new Set(entries.map((entry) => entry.field.path));
      for (const inherited of inheritedEntries) {
        if (nativePaths.has(inherited.field.path)) continue;
        entries.push(inherited);
      }

      if (!platforms.length && objectiveSummary?.platforms.length) {
        platforms = objectiveSummary.platforms;
        platformsInherited = true;
      }
    }
  }

  if (platforms.length > 0 && summary.type !== "rule") {
    const hasPlatforms = entries.some(
      (entry) => entry.field.path === "_platforms",
    );
    if (!hasPlatforms) {
      entries.push({
        field: {
          path: "_platforms",
          label: "Platforms",
          format: "pills",
        },
        value: platforms,
        ...(platformsInherited && parentObjective
          ? { inherited: true, inheritedFrom: parentObjective.name }
          : {}),
      });
    }
  }

  return { entries, parentObjective, platforms, platformsInherited };
}

export function getAssessmentPaths(type: ObjectType): string[] {
  const metadataSet = new Set<string>(METADATA_PATHS[type]);
  const descriptionPanelSet = new Set<string>(
    DESCRIPTION_PANEL_PATHS[type] ?? [],
  );
  const paths: string[] = [];
  for (const field of FIELD_REGISTRY[type]) {
    const path = field.path;
    if (
      metadataSet.has(path) ||
      descriptionPanelSet.has(path) ||
      path === "threat.surface"
    ) {
      continue;
    }
    paths.push(path);
  }
  return paths;
}
