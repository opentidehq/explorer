import type {
  ExplorerBundle,
  ModelsIndex,
  ObjectBody,
} from "@/lib/opentide/types";

/**
 * In-memory corpora for graph tests, so they never read the build artifact in public/data
 * (which holds the fixture corpus or the library, depending on how the tests were run).
 */

export const THREAT_ID = "59548b96-9b01-414c-badd-c0bf2ab40d9a";
export const OBJECTIVE_ID = "fb62e879-9e91-4c5b-aaa7-999b2b1b3897";
export const SIGNAL_ID = "a3f7d796-146c-44b0-8d22-7a08daa0d963";
export const SIGNAL_B_ID = "b49d0a94-0000-4000-8000-000000000001";
export const RULE_ID = "bfae62bb-7ce1-46cd-a131-39803832fa9d";
export const SIGNAL_RULE_ID = "c1ae62bb-7ce1-46cd-a131-39803832fa9e";
export const SIGNAL_MAPPED_RULE_ID = "d1ae62bb-7ce1-46cd-a131-39803832fa9f";

/** Threats chained around THREAT_ID by withThreatChain. */
export const PRECURSOR_ID = "e1ae62bb-0000-4000-8000-000000000001";
export const FOLLOW_UP_ID = "e1ae62bb-0000-4000-8000-000000000002";
export const DISTANT_ID = "e1ae62bb-0000-4000-8000-000000000003";

/** One threat, one objective with two signals, and three rules mapped at each level. */
export function makeGraphFixtureBundle(): ExplorerBundle {
  const threat: ObjectBody = {
    name: "Shai-Hulud",
    metadata: { uuid: THREAT_ID, schema: "threat::1.0" },
    threat: { "att&ck": ["T1195.001"], threats: [] },
  };

  const objective: ObjectBody = {
    name: "Detect Shai-Hulud",
    metadata: { uuid: OBJECTIVE_ID, schema: "objective::1.0" },
    objective: {
      threats: [THREAT_ID],
      signals: [
        { uuid: SIGNAL_ID, name: "Install anomaly" },
        { uuid: SIGNAL_B_ID, name: "Bulk credential access" },
      ],
    },
  };

  const signalA: ObjectBody = {
    name: "Package Manager Install",
    metadata: { uuid: SIGNAL_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
  };

  const signalB: ObjectBody = {
    name: "Bulk Credential Access",
    metadata: { uuid: SIGNAL_B_ID, schema: "signal::1.0" },
    parent: OBJECTIVE_ID,
  };

  const directRule: ObjectBody = {
    name: "Direct Objective Rule",
    metadata: { uuid: RULE_ID, schema: "rule::1.0" },
    detection_model: OBJECTIVE_ID,
    configurations: { defender_for_endpoint: { status: "PRODUCTION" } },
  };

  const signalRule: ObjectBody = {
    name: "Signal Mapped Rule",
    metadata: { uuid: SIGNAL_RULE_ID, schema: "rule::1.0" },
    detection_model: SIGNAL_ID,
    configurations: { sentinel: { status: "STAGING" } },
  };

  const objectiveSignalRule: ObjectBody = {
    name: "Objective DM Signal Rule",
    metadata: { uuid: SIGNAL_MAPPED_RULE_ID, schema: "rule::1.0" },
    detection_model: OBJECTIVE_ID,
    description: `Implements DOM signal ${SIGNAL_B_ID}`,
    configurations: { sentinel: { status: "PRODUCTION" } },
  };

  const models: ModelsIndex = {
    threat: { [THREAT_ID]: threat },
    objective: { [OBJECTIVE_ID]: objective },
    signal: { [SIGNAL_ID]: signalA, [SIGNAL_B_ID]: signalB },
    rule: {
      [RULE_ID]: directRule,
      [SIGNAL_RULE_ID]: signalRule,
      [SIGNAL_MAPPED_RULE_ID]: objectiveSignalRule,
    },
  };

  const flatIndex = {
    [THREAT_ID]: threat,
    [OBJECTIVE_ID]: objective,
    [SIGNAL_ID]: signalA,
    [SIGNAL_B_ID]: signalB,
    [RULE_ID]: directRule,
    [SIGNAL_RULE_ID]: signalRule,
    [SIGNAL_MAPPED_RULE_ID]: objectiveSignalRule,
  };

  return {
    version: "0.1.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
    models,
    flatIndex,
    chaining: {},
    signals: { [SIGNAL_ID]: signalA, [SIGNAL_B_ID]: signalB },
    summaries: [
      {
        uuid: THREAT_ID,
        type: "threat",
        name: "Shai-Hulud",
        schema: "threat::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
      {
        uuid: OBJECTIVE_ID,
        type: "objective",
        name: "Detect Shai-Hulud",
        schema: "objective::1.0",
        techniques: [],
        actors: [],
        relatedCount: 3,
        platforms: [],
      },
      {
        uuid: SIGNAL_ID,
        type: "signal",
        name: "Package Manager Install",
        schema: "signal::1.0",
        techniques: [],
        actors: [],
        relatedCount: 2,
        platforms: [],
      },
      {
        uuid: SIGNAL_B_ID,
        type: "signal",
        name: "Bulk Credential Access",
        schema: "signal::1.0",
        techniques: [],
        actors: [],
        relatedCount: 2,
        platforms: [],
      },
      {
        uuid: RULE_ID,
        type: "rule",
        name: "Direct Objective Rule",
        schema: "rule::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
      {
        uuid: SIGNAL_RULE_ID,
        type: "rule",
        name: "Signal Mapped Rule",
        schema: "rule::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
      {
        uuid: SIGNAL_MAPPED_RULE_ID,
        type: "rule",
        name: "Objective DM Signal Rule",
        schema: "rule::1.0",
        techniques: [],
        actors: [],
        relatedCount: 1,
        platforms: [],
      },
    ],
  };
}

function ensureThreat(bundle: ExplorerBundle, id: string): ObjectBody {
  const existing = bundle.flatIndex[id];
  if (existing) return existing;
  const name = `Threat ${id.slice(-4)}`;
  const body: ObjectBody = {
    name,
    metadata: { uuid: id, schema: "threat::1.0" },
    threat: {},
  };
  bundle.flatIndex[id] = body;
  bundle.models.threat[id] = body;
  bundle.summaries.push({
    uuid: id,
    type: "threat",
    name,
    schema: "threat::1.0",
    techniques: [],
    actors: [],
    relatedCount: 0,
    platforms: [],
  });
  return body;
}

/**
 * Chain `source` to `target` the way the generator does: a `threat.chaining` link on the
 * source's body and the same link in the bundle's chaining index. Missing threats are added.
 */
export function chainThreat(
  bundle: ExplorerBundle,
  source: string,
  relation: string,
  target: string,
  description?: string,
): ExplorerBundle {
  const body = ensureThreat(bundle, source);
  ensureThreat(bundle, target);
  const section = (body["threat"] ??= {}) as ObjectBody;
  const links = (section["chaining"] ??= []) as ObjectBody[];
  links.push({
    relation,
    vector: target,
    ...(description ? { description } : {}),
  });
  const relations = (bundle.chaining[source] ??= {});
  (relations[relation] ??= []).push(target);
  return bundle;
}

/** The fixture with precursor → threat → follow-up → distant chained around THREAT_ID. */
export function withThreatChain(bundle = makeGraphFixtureBundle()) {
  chainThreat(bundle, PRECURSOR_ID, "sequence::preceeds", THREAT_ID);
  chainThreat(
    bundle,
    THREAT_ID,
    "sequence::preceeds",
    FOLLOW_UP_ID,
    "Install hooks run the payload",
  );
  chainThreat(bundle, FOLLOW_UP_ID, "support::enabling", DISTANT_ID);
  return bundle;
}
