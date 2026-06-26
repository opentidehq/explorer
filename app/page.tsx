import { ExplorerProvider } from "@/components/shell/explorer-context";
import { ExplorerShell } from "@/components/shell/explorer-shell";
import {
  loadAttackNavigatorSync,
  loadBundleSync,
  loadCoverageSync,
  loadSearchSync,
} from "@/lib/data/server";

export default function HomePage() {
  const bundle = loadBundleSync();
  const coverage = loadCoverageSync();
  const search = loadSearchSync();
  const attackNavigator = loadAttackNavigatorSync();

  return (
    <ExplorerProvider
      bundle={bundle}
      coverage={coverage}
      search={search}
      attackNavigator={attackNavigator}
    >
      <ExplorerShell />
    </ExplorerProvider>
  );
}
