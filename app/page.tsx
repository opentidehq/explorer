import { ExplorerProvider } from "@/components/shell/explorer-context";
import { ExplorerShell } from "@/components/shell/explorer-shell";
import {
  loadBundleSync,
  loadSearchSync,
  loadVocabSync,
} from "@/lib/data/server";

export default function HomePage() {
  const bundle = loadBundleSync();
  const search = loadSearchSync();
  const vocabIndex = loadVocabSync();

  return (
    <ExplorerProvider bundle={bundle} search={search} vocabIndex={vocabIndex}>
      <ExplorerShell />
    </ExplorerProvider>
  );
}
