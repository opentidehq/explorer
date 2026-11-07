import { SIGNAL_OBJECTIVE_KEY } from "@/lib/opentide/graph";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

/**
 * Whether a signal is one an objective embeds, promoted to an object by the bundle. Bundles
 * from earlier generators marked those by writing the objective over `parent`, which the
 * spec gives to a parent signal: such a `parent` counts only when it names an objective.
 */
export function isEmbeddedSignal(
  summary: BundleObjectSummary,
  body: ObjectBody,
  isObjective: (id: string) => boolean,
): boolean {
  if (summary.type !== "signal") return false;
  if (typeof body[SIGNAL_OBJECTIVE_KEY] === "string") return true;
  const parent = body["parent"];
  return typeof parent === "string" && isObjective(parent);
}

/** What the file says. Embedded signals show without the fields the bundle adds to them. */
export function fileBody(body: ObjectBody, embedded: boolean): ObjectBody {
  if (!embedded) return body;
  const {
    metadata: _metadata,
    [SIGNAL_OBJECTIVE_KEY]: objective,
    ...signal
  } = body;
  // Bundles from earlier generators wrote the objective over the signal's `parent`.
  if (objective === undefined) delete signal["parent"];
  return signal;
}
