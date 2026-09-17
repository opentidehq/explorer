import { ObjectDetailPage } from "@/components/objects/object-detail-page";
import { loadBundleSync } from "@/lib/data/server";

const ROUTE_TYPES = ["threats", "objectives", "signals", "rules"] as const;

type RouteType = (typeof ROUTE_TYPES)[number];

const TYPE_MAP: Record<RouteType, "threat" | "objective" | "signal" | "rule"> =
  {
    threats: "threat",
    objectives: "objective",
    signals: "signal",
    rules: "rule",
  };

export function generateStaticParams() {
  const bundle = loadBundleSync();
  const params: Array<{ type: RouteType; uuid: string }> = [];

  for (const routeType of ROUTE_TYPES) {
    const objectType = TYPE_MAP[routeType];
    for (const summary of bundle.summaries.filter(
      (s) => s.type === objectType,
    )) {
      params.push({ type: routeType, uuid: summary.uuid });
    }
  }

  return params;
}

export default async function ObjectRoutePage({
  params,
}: {
  params: Promise<{ type: RouteType; uuid: string }>;
}) {
  const { uuid } = await params;
  return <ObjectDetailPage uuid={uuid} />;
}
