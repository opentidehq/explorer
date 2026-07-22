import type { ObjectBody } from "@/lib/opentide/types";

export function extractObjectDescription(
  body: ObjectBody | undefined | null,
): string | null {
  if (!body) return null;
  if (typeof body["description"] === "string") return body["description"];
  const threat = body["threat"] as ObjectBody | undefined;
  if (typeof threat?.["description"] === "string") return threat["description"];
  const objective = body["objective"] as ObjectBody | undefined;
  if (typeof objective?.["description"] === "string") {
    return objective["description"];
  }
  return null;
}
