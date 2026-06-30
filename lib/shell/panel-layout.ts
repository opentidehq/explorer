export const PANEL_LAYOUT_STORAGE = {
  left: "explorer.panel.leftWidth",
  right: "explorer.panel.rightWidth",
  relations: "explorer.panel.relationsHeight",
  terrain: "explorer.panel.terrainHeight",
} as const;

export const PANEL_LAYOUT_DEFAULTS = {
  leftWidth: 400,
  rightWidth: 440,
  relationsHeight: 280,
  terrainHeight: 220,
  minLeftWidth: 280,
  maxLeftWidth: 640,
  minRightWidth: 320,
  maxRightWidth: 720,
  minRelationsHeight: 160,
  maxRelationsHeight: 560,
  minTerrainHeight: 120,
  maxTerrainHeight: 480,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readStoredPanelSize(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
  } catch {
    return fallback;
  }
}

export function writeStoredPanelSize(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // ignore quota / private mode
  }
}
