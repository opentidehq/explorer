import { Data } from "effect";
import type { ModelsIndex, ObjectBody, ObjectType } from "./types";

class GraphError extends Data.TaggedError("GraphError")<{
  readonly message: string;
  readonly uuid?: string;
}> {}

export interface GraphContext {
  readonly models: ModelsIndex;
  readonly flatIndex: Record<string, ObjectBody>;
  readonly chaining: Record<string, Record<string, string[]>>;
  readonly deprecatedStatuses?: ReadonlySet<string>;
}

const PARENT_MAPPINGS: Record<
  string,
  { data?: string; parent: string } | { parent: string }
> = {
  objective: { data: "objective", parent: "threats" },
  signal: { parent: "parent" },
  rule: { parent: "detection_model" },
};

const CHILD_MAPPINGS: Record<
  string,
  {
    child_types: string[];
    data_sections?: string[];
    references: string[];
  }
> = {
  threat: {
    child_types: ["objective"],
    data_sections: ["detection", "objective"],
    references: ["vectors", "threats"],
  },
  objective: {
    child_types: ["signal", "rule"],
    references: ["detection_model", "parent"],
  },
  signal: {
    child_types: ["rule"],
    references: ["detection_model"],
  },
};

function asStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export function getType(
  ctx: GraphContext,
  modelUuid: string,
  mute = false,
): ObjectType | null {
  const modelBody = ctx.flatIndex[modelUuid];
  if (!modelBody) {
    if (mute) return null;
    throw new GraphError({ message: "UUID not in index", uuid: modelUuid });
  }

  const metadata = modelBody["metadata"] as ObjectBody | undefined;
  const schema = metadata?.["schema"];
  if (typeof schema === "string") {
    const type = schema.split("::")[0];
    if (
      type === "threat" ||
      type === "objective" ||
      type === "signal" ||
      type === "rule"
    ) {
      return type;
    }
  }

  if (modelUuid in ctx.models.signal) return "signal";
  if ("configurations" in modelBody) return "rule";

  if (mute) return null;
  throw new GraphError({
    message: "Missing schema identifier",
    uuid: modelUuid,
  });
}

export function parents(ctx: GraphContext, id: string): string[] {
  const modelType = getType(ctx, id, true);
  if (!modelType) {
    const embeddedParent = ctx.flatIndex[id]?.["parent"];
    return typeof embeddedParent === "string" ? [embeddedParent] : [];
  }

  const mapping = PARENT_MAPPINGS[modelType];
  if (!mapping) return [];

  const modelData = ctx.models[modelType]?.[id] ?? ctx.flatIndex[id];
  if (!modelData) return [];

  if ("data" in mapping && mapping.data) {
    const section = modelData[mapping.data] as ObjectBody | undefined;
    return asStringArray(section?.[mapping.parent]);
  }

  return asStringArray(modelData[mapping.parent]);
}

function embeddedObjectiveSignals(
  ctx: GraphContext,
  objectiveId: string,
): string[] {
  const modelData = ctx.models.objective?.[objectiveId];
  if (!modelData) return [];

  const objective = modelData["objective"] as ObjectBody | undefined;
  const signals = objective?.["signals"];
  if (!Array.isArray(signals)) return [];

  const ids: string[] = [];
  for (const signal of signals) {
    if (!signal || typeof signal !== "object") continue;
    const uuid = (signal as ObjectBody)["uuid"];
    if (typeof uuid === "string" && uuid) ids.push(uuid);
  }
  return ids;
}

export function childs(ctx: GraphContext, modelId: string): string[] {
  const modelType = getType(ctx, modelId);
  if (!modelType) return [];

  const mapping = CHILD_MAPPINGS[modelType];
  if (!mapping) return [];

  const implementations: string[] = [];

  for (const childType of mapping.child_types) {
    const childIndex = ctx.models[childType as ObjectType] ?? {};
    for (const childId of Object.keys(childIndex)) {
      const childData = childIndex[childId];
      if (!childData) continue;

      if (mapping.data_sections) {
        for (const section of mapping.data_sections) {
          const sectionData = childData[section] as ObjectBody | undefined;
          for (const reference of mapping.references) {
            const refs = asStringArray(sectionData?.[reference]);
            if (new Set(refs).has(modelId)) implementations.push(childId);
          }
        }
      } else {
        for (const reference of mapping.references) {
          const refs = asStringArray(childData[reference]);
          if (new Set(refs).has(modelId)) implementations.push(childId);
        }
      }
    }
  }

  if (modelType === "objective") {
    implementations.push(...embeddedObjectiveSignals(ctx, modelId));
  }

  return [...new Set(implementations)];
}

function checkStatus(status: unknown): string {
  return typeof status === "string" ? status.toLowerCase() : "";
}

/** When a rule's detection_model is an objective, find an embedded signal it implements. */
export function ruleMapsViaSignal(
  ctx: GraphContext,
  ruleId: string,
  objectiveId: string,
): string | null {
  const signalIds = embeddedObjectiveSignals(ctx, objectiveId);
  if (signalIds.length === 0) return null;

  for (const signalId of signalIds) {
    if (new Set(childs(ctx, signalId)).has(ruleId)) return signalId;
  }

  const ruleBody = ctx.flatIndex[ruleId];
  if (ruleBody) {
    const serialized = JSON.stringify(ruleBody);
    for (const signalId of signalIds) {
      if (serialized.includes(signalId)) return signalId;
    }
  }

  return null;
}

/** Detection parents for a rule: signal when mapped via signal, else objective. */
export function ruleDetectionSources(
  ctx: GraphContext,
  ruleId: string,
): Array<{ sourceId: string; label: string }> {
  const sources: Array<{ sourceId: string; label: string }> = [];

  for (const parent of parents(ctx, ruleId)) {
    const parentType = getType(ctx, parent, true);
    if (parentType === "signal") {
      sources.push({ sourceId: parent, label: "rule" });
      continue;
    }
    if (parentType === "objective") {
      const viaSignal = ruleMapsViaSignal(ctx, ruleId, parent);
      if (viaSignal) {
        sources.push({ sourceId: viaSignal, label: "rule" });
      } else {
        sources.push({ sourceId: parent, label: "detects" });
      }
      continue;
    }
    sources.push({ sourceId: parent, label: "detects" });
  }

  return sources;
}

export function keepActiveRules(
  ctx: GraphContext,
  ruleList: string[],
): string[] {
  const deprecated =
    ctx.deprecatedStatuses ?? new Set(["deprecated", "retired"]);
  const active: string[] = [];

  for (const mdr of ruleList) {
    const mdrData = ctx.models.rule[mdr];
    if (!mdrData) continue;

    const configurations = mdrData["configurations"] as
      | Record<string, ObjectBody>
      | undefined;
    if (!configurations) {
      active.push(mdr);
      continue;
    }

    let isDeprecated = false;
    for (const system of Object.keys(configurations)) {
      const systemData = configurations[system];
      const status = checkStatus(systemData?.["status"]);
      if (deprecated.has(status)) {
        isDeprecated = true;
        break;
      }
    }
    if (!isDeprecated) active.push(mdr);
  }

  return active;
}

export function techniquesResolver(
  ctx: GraphContext,
  modelId: string,
  recursive = true,
): string[] {
  const modelType = getType(ctx, modelId);
  if (!modelType) return [];

  const modelBody = ctx.models[modelType]?.[modelId];
  if (!modelBody) return [];

  let techniques: string[] = [];

  if (modelType === "rule") {
    const parentId =
      (modelBody["detection_model"] as string | undefined) ??
      ((modelBody["tags"] as ObjectBody | undefined)?.["coretide"] as
        | string
        | undefined);
    if (!parentId) return [];
    if (recursive) {
      techniques = techniquesResolver(ctx, parentId, true);
    }
    return techniques;
  }

  if (modelType === "objective") {
    const objective = modelBody["objective"] as ObjectBody | undefined;
    if (objective && Array.isArray(objective["att&ck"])) {
      techniques = objective["att&ck"] as string[];
    } else {
      const parentIds = asStringArray(objective?.["threats"]);
      if (recursive) {
        for (const parentId of parentIds) {
          techniques.push(...techniquesResolver(ctx, parentId, true));
        }
      }
    }
  }

  if (modelType === "threat") {
    const threat = modelBody["threat"] as ObjectBody | undefined;
    if (threat && Array.isArray(threat["att&ck"])) {
      techniques = threat["att&ck"] as string[];
    }
  }

  return [...new Set(techniques)];
}

interface RelationTree {
  [key: string]: RelationTree | null | string[] | undefined;
}

type RelationsResult = RelationTree | string[];

function relationsDownstream(ctx: GraphContext, id: string): RelationsResult {
  const type = getType(ctx, id);
  if (!type) return {};

  if (type === "signal") {
    return keepActiveRules(ctx, childs(ctx, id));
  }

  if (type === "objective") {
    const tree: RelationTree = {};
    for (const child of childs(ctx, id)) {
      const childType = getType(ctx, child);
      if (childType === "signal") {
        tree[child] = relationsDownstream(ctx, child);
      } else if (childType === "rule") {
        tree[child] = null;
      }
    }
    return tree;
  }

  const tree: RelationTree = {};
  for (const c of childs(ctx, id)) {
    tree[c] = relationsDownstream(ctx, c);
  }
  return tree;
}

function relationsUpstream(ctx: GraphContext, id: string): RelationsResult {
  const type = getType(ctx, id);
  if (!type || type === "threat") return {};

  const tree: RelationTree = {};
  for (const p of parents(ctx, id)) {
    tree[p] = relationsUpstream(ctx, p);
  }
  return tree;
}

function* recursiveItems(
  dictionary: RelationTree,
): Generator<[string | string[], RelationTree | null | string[] | undefined]> {
  for (const [key, value] of Object.entries(dictionary)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      yield [key, value];
      yield* recursiveItems(value);
    } else {
      yield [key, value ?? null];
    }
  }
}

export function relationsList(
  ctx: GraphContext,
  id: string,
  mode: "count" | "flat" = "flat",
  direction: "upstream" | "downstream" | "both" = "downstream",
): Record<string, string[] | number> {
  let relations: RelationsResult;

  if (direction === "upstream") {
    relations = relationsUpstream(ctx, id);
  } else if (direction === "downstream") {
    relations = relationsDownstream(ctx, id);
  } else {
    const merged = relationsList(ctx, id, mode, "downstream") as Record<
      string,
      string[]
    >;
    const upstream = relationsList(ctx, id, mode, "upstream") as Record<
      string,
      string[]
    >;
    for (const [k, v] of Object.entries(upstream)) {
      merged[k] = [...new Set([...(merged[k] ?? []), ...v])];
    }
    if (mode === "count") {
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(merged)) {
        counts[k] = v.length;
      }
      return counts;
    }
    return merged;
  }

  const flat: Record<string, string[]> = {};

  if (Array.isArray(relations) && relations.length > 0) {
    const first = relations[0];
    if (first) {
      const t = getType(ctx, first);
      if (t) flat[t] = relations;
    }
  }

  if (relations && typeof relations === "object" && !Array.isArray(relations)) {
    for (const [k, v] of recursiveItems(relations)) {
      if (k) {
        if (Array.isArray(k)) {
          const kType = k[0] ? getType(ctx, k[0]) : null;
          if (kType) {
            flat[kType] = [...(flat[kType] ?? []), ...k];
          }
        } else if (typeof k === "string") {
          const kType = getType(ctx, k);
          if (kType) flat[kType] = [...(flat[kType] ?? []), k];
        }
      }
      if (v) {
        if (Array.isArray(v)) {
          const vType = v[0] ? getType(ctx, v[0]) : null;
          if (vType) flat[vType] = [...(flat[vType] ?? []), ...v];
        } else if (typeof v === "string") {
          const vType = getType(ctx, v);
          if (vType) flat[vType] = [...(flat[vType] ?? []), v];
        }
      }
    }
  }

  for (const [k, v] of Object.entries(flat)) {
    flat[k] = [...new Set(v)];
  }

  if (flat["rule"]) {
    flat["rule"] = keepActiveRules(ctx, flat["rule"]);
  }

  if (mode === "count") {
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(flat)) {
      counts[k] = v.length;
    }
    return counts;
  }

  return flat;
}

/** UUIDs linked to `id` via threat chaining (graph index, resolver, or body vectors). */
export function chainingNeighbors(
  ctx: GraphContext,
  id: string,
  options?: {
    corpusChainingEdges?: ReadonlyArray<{
      source: string;
      target: string;
      kind: string;
    }>;
    threatChainingVectors?: string[];
  },
): string[] {
  const neighbors = new Set<string>();

  for (const edge of options?.corpusChainingEdges ?? []) {
    if (edge.kind !== "chaining") continue;
    if (edge.source === id) neighbors.add(edge.target);
    if (edge.target === id) neighbors.add(edge.source);
  }

  const outgoing = ctx.chaining[id];
  if (outgoing) {
    for (const targets of Object.values(outgoing)) {
      for (const target of targets) neighbors.add(target);
    }
  }

  for (const [root, relations] of Object.entries(ctx.chaining)) {
    for (const targets of Object.values(relations)) {
      if (!new Set(targets).has(id)) continue;
      neighbors.add(root);
      for (const target of targets) {
        if (target !== id) neighbors.add(target);
      }
    }
  }

  const resolved = chainResolver(ctx, id);
  for (const [source, relations] of Object.entries(resolved)) {
    if (source !== id) neighbors.add(source);
    for (const targets of Object.values(relations)) {
      for (const target of targets) neighbors.add(target);
    }
  }

  for (const vector of options?.threatChainingVectors ?? []) {
    if (vector) neighbors.add(vector);
  }

  neighbors.delete(id);
  return [...neighbors];
}

/** Threats with an outbound chaining link whose vector is `id`. */
export function inboundChainingSources(
  ctx: GraphContext,
  id: string,
  options?: {
    corpusChainingEdges?: ReadonlyArray<{
      source: string;
      target: string;
      kind: string;
    }>;
  },
): string[] {
  const sources = new Set<string>();

  for (const [rootId, relations] of Object.entries(ctx.chaining)) {
    if (rootId === id) continue;
    for (const targets of Object.values(relations)) {
      if (new Set(targets).has(id)) {
        sources.add(rootId);
        break;
      }
    }
  }

  for (const edge of options?.corpusChainingEdges ?? []) {
    if (edge.kind !== "chaining") continue;
    if (edge.target === id && edge.source !== id) {
      sources.add(edge.source);
    }
  }

  return [...sources];
}

export interface ChainsTabData {
  chainingLinks: Array<ObjectBody>;
  relatedChainIds: string[];
  count: number;
}

/** Stable unique key for a chains-tab link card (relation+vector may repeat). */
export function chainingLinkRowKey(link: ObjectBody, index: number): string {
  const relation = String(link["relation"] ?? "");
  const vector =
    typeof link["vector"] === "string" ? link["vector"] : `row-${index}`;
  return `${relation}::${vector}::${index}`;
}

/**
 * Deduped chains-tab rows: explicit outbound `threat.chaining` link cards plus,
 * only when this threat has no outbound links, inbound threats that chain here.
 */
export function chainsTabData(
  ctx: GraphContext,
  id: string,
  chainingLinks: Array<ObjectBody>,
  options?: {
    corpusChainingEdges?: ReadonlyArray<{
      source: string;
      target: string;
      kind: string;
    }>;
  },
): ChainsTabData {
  const outboundVectors = new Set(
    chainingLinks
      .map((link) => link["vector"])
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );

  const excluded = new Set<string>([id, ...outboundVectors]);

  const resolved = chainResolver(ctx, id);
  for (const targets of Object.values(resolved[id] ?? {})) {
    for (const target of targets) excluded.add(target);
  }

  let relatedChainIds: string[] = [];
  if (chainingLinks.length === 0) {
    relatedChainIds = inboundChainingSources(ctx, id, options).filter(
      (sourceId) => !excluded.has(sourceId),
    );
  }

  return {
    chainingLinks,
    relatedChainIds,
    count: chainingLinks.length + relatedChainIds.length,
  };
}

export function chainResolver(
  ctx: GraphContext,
  entryPoint: string,
  chain: Record<string, Record<string, string[]>> = {},
): Record<string, Record<string, string[]>> {
  const vectorChaining = ctx.chaining[entryPoint];
  if (!vectorChaining) return chain;

  for (const link of Object.keys(vectorChaining)) {
    if (!(entryPoint in chain)) chain[entryPoint] = {};
    if (!(link in chain[entryPoint]!)) chain[entryPoint]![link] = [];

    for (const v of vectorChaining[link] ?? []) {
      const seen = new Set(chain[entryPoint]![link]!);
      if (!seen.has(v)) {
        chain[entryPoint]![link]!.push(v);
        chainResolver(ctx, v, chain);
      }
    }
  }

  return chain;
}

export function createGraphContext(bundle: {
  models: ModelsIndex;
  flatIndex: Record<string, ObjectBody>;
  chaining: Record<string, Record<string, string[]>>;
}): GraphContext {
  return {
    models: bundle.models,
    flatIndex: bundle.flatIndex,
    chaining: bundle.chaining,
  };
}
