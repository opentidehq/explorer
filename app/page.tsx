import { ExplorerProvider } from "@/components/shell/explorer-context";
import { ExplorerShell } from "@/components/shell/explorer-shell";
import { loadBundleSync, loadSearchSync } from "@/lib/data/server";

export default function HomePage() {
  const bundle = loadBundleSync();
  const search = loadSearchSync();

  return (
    <ExplorerProvider bundle={bundle} search={search}>
      <ExplorerShell />
    </ExplorerProvider>
  );
}
