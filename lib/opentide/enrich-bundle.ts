import type {
  BundleObjectSummary,
  ExplorerBundle,
  ExplorerSearchIndex,
  ObjectBody,
  SearchDocument,
} from "@/lib/opentide/types";

function embeddedSignalBodies(
  objectiveId: string,
  body: ObjectBody,
): Array<{ uuid: string; body: ObjectBody }> {
  const objective = body["objective"] as ObjectBody | undefined;
  const signals = objective?.["signals"];
  if (!Array.isArray(signals)) return [];

  const results: Array<{ uuid: string; body: ObjectBody }> = [];
  for (const signal of signals) {
    if (!signal || typeof signal !== "object") continue;
    const record = signal as ObjectBody;
    const uuid = record["uuid"];
    if (typeof uuid !== "string" || !uuid) continue;

    const name =
      typeof record["name"] === "string" ? record["name"] : "Embedded signal";

    results.push({
      uuid,
      body: {
        ...record,
        name,
        metadata: {
          uuid,
          schema: "signal::1.0",
        },
        parent: objectiveId,
      },
    });
  }
  return results;
}

function buildSignalSummary(
  uuid: string,
  body: ObjectBody,
  _objectiveId: string,
): BundleObjectSummary {
  const entities = body["entities"];
  const entityList = Array.isArray(entities)
    ? entities.filter((e): e is string => typeof e === "string")
    : [];

  return {
    uuid,
    type: "signal",
    name: String(body["name"] ?? uuid),
    schema: "signal::1.0",
    techniques: [],
    actors: [],
    relatedCount: 1 + entityList.length,
    platforms: [],
    status:
      typeof body["severity"] === "string"
        ? String(body["severity"])
        : undefined,
  };
}

function buildSignalDocument(
  summary: BundleObjectSummary,
  body: ObjectBody,
  objectiveId: string,
): SearchDocument {
  const description =
    typeof body["description"] === "string" ? body["description"] : "";
  const methodology =
    typeof body["methodology"] === "string" ? body["methodology"] : "";

  return {
    id: summary.uuid,
    uuid: summary.uuid,
    type: "signal",
    name: summary.name,
    techniques: summary.techniques,
    actors: summary.actors,
    platforms: summary.platforms,
    schema: summary.schema ?? "",
    tlp: summary.tlp ?? "",
    status: summary.status ?? "",
    relatedCount: summary.relatedCount,
    content: [description, methodology, objectiveId, summary.uuid]
      .filter(Boolean)
      .join(" ")
      .slice(0, 4000),
  };
}

/** Promote objective-embedded signals into models, summaries, and search docs. */
export function enrichBundle(bundle: ExplorerBundle): ExplorerBundle {
  const models = {
    ...bundle.models,
    signal: { ...bundle.models.signal },
  };
  const flatIndex = { ...bundle.flatIndex };
  const signals = { ...bundle.signals };
  const summaryById = new Map(bundle.summaries.map((s) => [s.uuid, s]));
  const summaries = [...bundle.summaries];

  for (const [objectiveId, body] of Object.entries(models.objective)) {
    for (const { uuid, body: signalBody } of embeddedSignalBodies(
      objectiveId,
      body,
    )) {
      if (models.signal[uuid]) continue;

      models.signal[uuid] = signalBody;
      flatIndex[uuid] = signalBody;
      signals[uuid] = signalBody;

      if (!summaryById.has(uuid)) {
        const summary = buildSignalSummary(uuid, signalBody, objectiveId);
        summaries.push(summary);
        summaryById.set(uuid, summary);
      }
    }
  }

  return {
    ...bundle,
    models,
    flatIndex,
    signals,
    summaries,
  };
}

export function enrichSearchIndex(
  bundle: ExplorerBundle,
  search: ExplorerSearchIndex,
): ExplorerSearchIndex {
  const enriched = enrichBundle(bundle);
  const existing = new Set(search.documents.map((d) => d.uuid));
  const documents = [...search.documents];

  for (const summary of enriched.summaries) {
    if (summary.type !== "signal" || existing.has(summary.uuid)) continue;
    const body = enriched.flatIndex[summary.uuid];
    if (!body) continue;
    const parent = body["parent"];
    documents.push(
      buildSignalDocument(
        summary,
        body,
        typeof parent === "string" ? parent : "",
      ),
    );
    existing.add(summary.uuid);
  }

  return { documents };
}
