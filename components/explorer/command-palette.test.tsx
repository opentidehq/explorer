import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "@/components/explorer/command-palette";
import {
  ExplorerProvider,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { buildCatalog } from "@/lib/explorer/catalog";
import { makeGraphFixtureBundle } from "@/lib/graph/test-fixtures";
import { normalizeVisibility } from "@/lib/opentide/visibility";

const captured: { actions?: ReturnType<typeof useExplorerActions> } = {};
function Probe() {
  const actions = useExplorerActions();
  useEffect(() => {
    captured.actions = actions;
  }, [actions]);
  return <output data-testid="view">{useExplorer((s) => s.view)}</output>;
}

function openPalette(withVisibility: boolean) {
  const catalog = buildCatalog(
    makeGraphFixtureBundle(),
    {},
    withVisibility
      ? normalizeVisibility({ version: "1.0", logsources: [] })
      : null,
  );
  render(
    <ExplorerProvider catalog={catalog}>
      <Probe />
      <CommandPalette />
    </ExplorerProvider>,
  );
  act(() => captured.actions!.setPaletteOpen(true));
}

/** The views group's items: label and number key. */
function views(): string[] {
  return screen
    .getAllByRole("option")
    .filter((item) => item.getAttribute("data-value")?.startsWith("view-"))
    .map((item) => item.textContent ?? "");
}

describe("CommandPalette views", () => {
  it("lists the Visibility view, on key 4, when the corpus has it", () => {
    openPalette(true);
    expect(views()).toEqual(["Graph1", "Catalogue2", "ATT&CK3", "Visibility4"]);
    act(() => screen.getByRole("option", { name: /Visibility/ }).click());
    expect(screen.getByTestId("view").textContent).toBe("visibility");
  });

  it("leaves it out without the export", () => {
    openPalette(false);
    expect(views()).toEqual(["Graph1", "Catalogue2", "ATT&CK3"]);
  });
});
