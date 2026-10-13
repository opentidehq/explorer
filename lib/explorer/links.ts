import type { Catalog } from "@/lib/explorer/catalog";
import { getDetectionChain, inEdges, outEdges } from "@/lib/graph/corpus-graph";
import type { ObjectBody, ObjectType } from "@/lib/opentide/types";

/**
 * An object's links, read from where they are written: each card names the field that holds
 * the reference (`objective.threats`, `rule.detection_model`, `threat.chaining`), as the
 * ontology map on opentide.org labels its edges.
 */

export type LinkKind = "uuid" | "nested" | "derived";

export interface LinkCard {
  key: string;
  otherId: string;
  /** `objective.threats` — the field holding the reference. */
  field: string;
  /** The type the field points at. */
  target: ObjectType;
  kind: LinkKind;
  relation?: string;
  description?: string;
}

export interface LinkGroup {
  key: string;
  title: string;
  cards: LinkCard[];
}

function typeOf(catalog: Catalog, id: string): ObjectType | undefined {
  return (
    catalog.summaries.get(id)?.type ?? catalog.corpus.nodeById.get(id)?.type
  );
}

/** The `threat.chaining` entry on `source` that points at `target`. */
function chainingEntries(
  catalog: Catalog,
  source: string,
  target: string,
): Array<{ relation: string; description?: string }> {
  const threat = catalog.bundle.flatIndex[source]?.["threat"] as
    | ObjectBody
    | undefined;
  const links = (threat?.["chaining"] as ObjectBody[] | undefined) ?? [];
  const found = links
    .filter((link) => link["vector"] === target)
    .map((link) => ({
      relation: String(link["relation"] ?? ""),
      description:
        typeof link["description"] === "string"
          ? (link["description"] as string)
          : undefined,
    }));
  if (found.length) return found;
  // Resolved transitively (the chain index) without a written entry on this threat.
  const resolved = catalog.bundle.chaining[source] ?? {};
  return Object.entries(resolved)
    .filter(([, targets]) => targets.includes(target))
    .map(([relation]) => ({ relation }));
}

function detectionField(targetType: ObjectType | undefined): {
  field: string;
  kind: LinkKind;
} {
  if (targetType === "objective")
    return { field: "objective.threats", kind: "uuid" };
  if (targetType === "signal")
    return { field: "objective.signals[]", kind: "nested" };
  return { field: "rule.detection_model", kind: "uuid" };
}

export function linkGroups(catalog: Catalog, id: string): LinkGroup[] {
  const type = typeOf(catalog, id);
  if (!type) return [];

  const groups = new Map<string, LinkGroup>();
  const add = (key: string, title: string, card: LinkCard) => {
    const group = groups.get(key) ?? { key, title, cards: [] };
    if (!group.cards.some((c) => c.key === card.key)) group.cards.push(card);
    groups.set(key, group);
  };

  for (const edge of outEdges(catalog.corpus, id)) {
    const targetType = typeOf(catalog, edge.target);
    if (!targetType) continue;
    if (edge.kind === "chaining") {
      for (const entry of chainingEntries(catalog, id, edge.target)) {
        add("chains-to", "chains to", {
          key: `out-${edge.target}-${entry.relation}`,
          otherId: edge.target,
          field: "threat.chaining",
          target: "threat",
          kind: "uuid",
          ...entry,
        });
      }
      continue;
    }
    const { field, kind } = detectionField(targetType);
    if (targetType === "objective") {
      add("detected-by", "detected by", {
        key: `o-${edge.target}`,
        otherId: edge.target,
        field,
        target: "threat",
        kind,
      });
    } else if (targetType === "signal") {
      add("signals", "signals", {
        key: `s-${edge.target}`,
        otherId: edge.target,
        field,
        target: "signal",
        kind,
      });
    } else if (targetType === "rule") {
      add("implemented-by", "implemented by", {
        key: `r-${edge.target}`,
        otherId: edge.target,
        field,
        target: type,
        kind,
      });
    }
  }

  for (const edge of inEdges(catalog.corpus, id)) {
    const sourceType = typeOf(catalog, edge.source);
    if (!sourceType) continue;
    if (edge.kind === "chaining") {
      for (const entry of chainingEntries(catalog, edge.source, id)) {
        add("chained-from", "chained from", {
          key: `in-${edge.source}-${entry.relation}`,
          otherId: edge.source,
          field: "threat.chaining",
          target: "threat",
          kind: "uuid",
          ...entry,
        });
      }
      continue;
    }
    if (type === "objective" && sourceType === "threat") {
      add("covers", "covers", {
        key: `t-${edge.source}`,
        otherId: edge.source,
        field: "objective.threats",
        target: "threat",
        kind: "uuid",
      });
    } else if (type === "signal") {
      add("part-of", "part of", {
        key: `p-${edge.source}`,
        otherId: edge.source,
        field: "objective.signals[]",
        target: "signal",
        kind: "nested",
      });
    } else if (type === "rule") {
      add("implements", "implements", {
        key: `m-${edge.source}`,
        otherId: edge.source,
        field: "rule.detection_model",
        target: sourceType,
        kind: "uuid",
      });
    }
  }

  // Signals and rules detect threats through their objective.
  if (type === "signal" || type === "rule") {
    const direct = new Set(
      inEdges(catalog.corpus, id).map((edge) => edge.source),
    );
    for (const other of getDetectionChain(catalog.corpus, id).nodes) {
      if (
        other === id ||
        direct.has(other) ||
        typeOf(catalog, other) !== "threat"
      )
        continue;
      add("detects", "detects, through its objective", {
        key: `d-${other}`,
        otherId: other,
        field: "objective.threats",
        target: "threat",
        kind: "derived",
      });
    }
  }

  const order = [
    "covers",
    "part-of",
    "implements",
    "detects",
    "signals",
    "detected-by",
    "implemented-by",
    "chains-to",
    "chained-from",
  ];
  return order.flatMap((key) => {
    const group = groups.get(key);
    return group ? [group] : [];
  });
}

export function linkCount(groups: LinkGroup[]): number {
  return groups.reduce((n, group) => n + group.cards.length, 0);
}
