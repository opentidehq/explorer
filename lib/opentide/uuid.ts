/** An object uuid as a pattern to build on, e.g. into a permalink route. */
export const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A whole string that is an object uuid, in either case. */
export const UUID_RE = new RegExp(`^${UUID_PATTERN}$`, "i");
