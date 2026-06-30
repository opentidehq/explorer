export const EXPLORER_VIEWS = ["graph", "list", "attack"] as const;
export type ExplorerView = (typeof EXPLORER_VIEWS)[number];

export const EXPLORER_VIEW_LABELS: Record<ExplorerView, string> = {
  graph: "Graph",
  list: "List",
  attack: "ATT&CK",
};

const STORAGE_KEY = "explorer:view-mode:v1";

export function readStoredExplorerView(): ExplorerView {
  if (typeof window === "undefined") return "graph";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && EXPLORER_VIEWS.includes(raw as ExplorerView)) {
      return raw as ExplorerView;
    }
  } catch {
    /* private browsing */
  }
  return "graph";
}

export function writeStoredExplorerView(view: ExplorerView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    /* quota / disabled */
  }
}
