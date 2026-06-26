import Link from "next/link";
import { ObjectDetailPage } from "@/components/objects/object-detail-page";
import {
  loadBundleSync,
  loadCoverageSync,
  loadSearchSync,
  loadAttackNavigatorSync,
} from "@/lib/data/server";
import { ExplorerProvider } from "@/components/shell/explorer-context";

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
  const { type, uuid } = await params;
  const bundle = loadBundleSync();
  const summary = bundle.summaries.find((s) => s.uuid === uuid);
  const body = bundle.flatIndex[uuid];

  if (!summary || !body) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Object not found</h1>
          <Link href="/" className="mt-4 text-primary hover:underline">
            Back to explorer
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ExplorerProvider
      bundle={bundle}
      coverage={loadCoverageSync()}
      search={loadSearchSync()}
      attackNavigator={loadAttackNavigatorSync()}
    >
      <ObjectDetailPage summary={summary} body={body} routeType={type} />
    </ExplorerProvider>
  );
}
