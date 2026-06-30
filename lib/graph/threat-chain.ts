import { chainResolver, type GraphContext } from "@/lib/opentide/graph";
import type { ObjectBody } from "@/lib/opentide/types";

export interface ThreatChainEdge {
  relation: string;
  description?: string;
  target: ThreatChainNode;
}

export interface ThreatChainNode {
  id: string;
  isRoot: boolean;
  /** Target already appears upstream — show as link without re-expanding. */
  isReference: boolean;
  outgoing: ThreatChainEdge[];
}

function linkDescription(
  body: ObjectBody | undefined,
  relation: string,
  targetId: string,
): string | undefined {
  const threat = body?.["threat"] as ObjectBody | undefined;
  const chaining = threat?.["chaining"] as Array<ObjectBody> | undefined;
  if (!chaining?.length) return undefined;

  const match = chaining.find(
    (link) =>
      String(link["relation"] ?? "") === relation &&
      String(link["vector"] ?? "") === targetId,
  );
  const description = match?.["description"];
  return typeof description === "string" ? description : undefined;
}

function hasChainingData(ctx: GraphContext, threatId: string): boolean {
  if (ctx.chaining[threatId]) return true;
  const body = ctx.flatIndex[threatId];
  const threat = body?.["threat"] as ObjectBody | undefined;
  const links = threat?.["chaining"] as unknown[] | undefined;
  return Array.isArray(links) && links.length > 0;
}

/** Resolved transitive threat chain for modal display. */
export function buildThreatChainTree(
  ctx: GraphContext,
  rootId: string,
): ThreatChainNode | null {
  if (!hasChainingData(ctx, rootId)) return null;

  const onPath = new Set<string>();

  function build(id: string, isRoot: boolean): ThreatChainNode {
    const resolved = chainResolver(ctx, id);
    const relations = resolved[id];
    const outgoing: ThreatChainEdge[] = [];

    if (relations) {
      for (const [relation, targets] of Object.entries(relations)) {
        for (const targetId of targets) {
          const description = linkDescription(
            ctx.flatIndex[id],
            relation,
            targetId,
          );
          const isReference = onPath.has(targetId);
          let target: ThreatChainNode;

          if (isReference) {
            target = {
              id: targetId,
              isRoot: false,
              isReference: true,
              outgoing: [],
            };
          } else {
            onPath.add(targetId);
            target = build(targetId, false);
            onPath.delete(targetId);
          }

          outgoing.push({ relation, description, target });
        }
      }
    }

    return { id, isRoot, isReference: false, outgoing };
  }

  onPath.add(rootId);
  return build(rootId, true);
}

export function countThreatChainNodes(node: ThreatChainNode): number {
  const seen = new Set<string>();
  const walk = (current: ThreatChainNode) => {
    if (seen.has(current.id)) return;
    seen.add(current.id);
    for (const edge of current.outgoing) walk(edge.target);
  };
  walk(node);
  return seen.size;
}
