import type { Metadata } from "next";
import { ExplorerApp } from "@/components/explorer/explorer-app";
import { loadBundleSync, objectMetadataSync } from "@/lib/data/server";
import { TYPE_LABELS, TYPE_PLURALS } from "@/lib/graph/type-icons";
import type { ObjectType } from "@/lib/opentide/types";

const ROUTE_TYPES: Record<string, ObjectType> = {
  threats: "threat",
  objectives: "objective",
  signals: "signal",
  rules: "rule",
};

type Params = { type: string; uuid: string };

// Permalinks exist for every object in the bundle, and only for those.
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return loadBundleSync().summaries.map((summary) => ({
    type: TYPE_PLURALS[summary.type],
    uuid: summary.uuid,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { type, uuid } = await params;
  const found = objectMetadataSync(uuid);
  if (!found || ROUTE_TYPES[type] !== found.summary.type) return {};
  const { summary, description } = found;
  const title = `${summary.name}`;
  const lead = `${TYPE_LABELS[summary.type]} in the opentide library`;
  return {
    title,
    description: description ?? lead,
    openGraph: { title, description: description ?? lead },
  };
}

export default async function ObjectRoutePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { uuid } = await params;
  return <ExplorerApp initialId={uuid} />;
}
