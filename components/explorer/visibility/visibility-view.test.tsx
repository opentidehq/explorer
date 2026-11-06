import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExplorerProvider,
  availableViews,
  useExplorer,
  useExplorerActions,
} from "@/components/explorer/explorer-state";
import { ObjectLogSources } from "@/components/explorer/inspector/object-logsources";
import { VisibilityView } from "@/components/explorer/visibility/visibility-view";
import { buildCatalog } from "@/lib/explorer/catalog";
import {
  OBJECTIVE_ID,
  RULE_ID,
  SIGNAL_ID,
  makeGraphFixtureBundle,
} from "@/lib/graph/test-fixtures";
import {
  normalizeVisibility,
  type VisibilityExport,
} from "@/lib/opentide/visibility";

const visibility = normalizeVisibility({
  version: "1.0",
  tlp: "red",
  logsources: [
    {
      name: "SecurityEvent",
      system: "sentinel",
      description: "Windows security events.",
      columns: [{ name: "EventID", type: "int", description: "The event." }],
      read_by: [RULE_ID],
      rules: [RULE_ID],
    },
    {
      name: "Contoso_Audit_CL",
      system: "sentinel",
      description: "Administrative audit events.",
    },
    {
      name: "npm registry logs",
      system: "elastic",
      description: "Package installs.",
      objectives: [OBJECTIVE_ID],
      signals: [
        { objective: OBJECTIVE_ID, uuid: SIGNAL_ID, name: "Install anomaly" },
      ],
    },
  ],
  undeclared: [
    {
      system: "sentinel",
      name: "SigninLogs",
      rules: [RULE_ID],
      system_declares: true,
    },
  ],
  unknown_signal_sources: [
    { name: "Okta System Log", objectives: [OBJECTIVE_ID] },
  ],
});

function View({
  withVisibility = true,
  data = visibility,
  inspector = false,
}: {
  withVisibility?: boolean;
  data?: VisibilityExport | null;
  inspector?: boolean;
}) {
  const catalog = buildCatalog(
    makeGraphFixtureBundle(),
    {},
    withVisibility ? data : null,
  );
  return (
    <ExplorerProvider catalog={catalog}>
      <Probe />
      <VisibilityView />
      {inspector ? <ObjectLogSources id={RULE_ID} /> : null}
    </ExplorerProvider>
  );
}

const captured: { actions?: ReturnType<typeof useExplorerActions> } = {};
function Probe() {
  const actions = useExplorerActions();
  useEffect(() => {
    captured.actions = actions;
  }, [actions]);
  const view = useExplorer((s) => s.view);
  const selected = useExplorer((s) => s.selectedId);
  return (
    <output data-testid="state">
      {view}|{selected ?? ""}
    </output>
  );
}

describe("VisibilityView", () => {
  it("shows the overview, the TLP and the log sources", () => {
    render(<View />);
    expect(screen.getByText("TLP:RED")).toBeTruthy();
    expect(screen.getByText("log sources").previousSibling?.textContent).toBe(
      "3",
    );
    expect(
      screen.getByText("without columns").previousSibling?.textContent,
    ).toBe("2");
    expect(
      screen.getByText("used by no detection").previousSibling?.textContent,
    ).toBe("1");
    expect(
      screen.getByText("read but not declared").previousSibling?.textContent,
    ).toBe("1");
    expect(screen.getByText("SecurityEvent")).toBeTruthy();
    expect(screen.getByText("Contoso_Audit_CL")).toBeTruthy();
  });

  it("searches, filters by system and lists what needs attention", () => {
    render(<View />);
    fireEvent.change(screen.getByLabelText("Search log sources"), {
      target: { value: "audit" },
    });
    expect(screen.queryByText("SecurityEvent")).toBeNull();
    expect(screen.getByText("Contoso_Audit_CL")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search log sources"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^elastic 1/ }));
    expect(screen.getByText("npm registry logs")).toBeTruthy();
    expect(screen.queryByText("SecurityEvent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "all systems" }));
    fireEvent.click(
      screen.getByRole("button", { name: /read but not declared/ }),
    );
    expect(screen.getByText("SigninLogs")).toBeTruthy();
  });

  it("opens a log source's page, and a detection from it", () => {
    render(<View />);
    fireEvent.click(screen.getByRole("button", { name: /^SecurityEvent/ }));
    const page = screen.getByRole("article", {
      name: "Log source SecurityEvent",
    });
    expect(page.textContent).toContain("Columns (1)");
    expect(page.textContent).toContain("EventID");
    expect(page.textContent).toContain("Rules whose queries read it (1)");
    const [rule] = within(page)
      .getAllByRole("button")
      .filter((button) => !button.textContent?.includes("all log sources"));
    fireEvent.click(rule!);
    expect(screen.getByTestId("state").textContent).toContain(`|${RULE_ID}`);
  });

  it("links a rule to the log sources it uses", () => {
    render(<View inspector />);
    const link = screen.getByRole("button", {
      name: /SecurityEvent.*its query reads it/,
    });
    act(() => captured.actions!.setView("graph"));
    fireEvent.click(link);
    expect(screen.getByTestId("state").textContent).toMatch(/^visibility\|/);
    expect(
      screen.getByRole("article", { name: "Log source SecurityEvent" }),
    ).toBeTruthy();
  });
});

describe("without a visibility export", () => {
  it("has no Visibility view and nothing breaks", () => {
    render(<View withVisibility={false} />);
    expect(screen.queryByText("TLP:RED")).toBeNull();
    expect(
      availableViews(buildCatalog(makeGraphFixtureBundle(), {}, null)),
    ).toEqual(["graph", "catalogue", "attack"]);
    act(() => captured.actions!.setView("visibility"));
    expect(screen.getByTestId("state").textContent).toMatch(/^graph\|/);
    act(() => captured.actions!.openLogSource("sentinel:SecurityEvent"));
    expect(screen.getByTestId("state").textContent).toMatch(/^graph\|/);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

/** The layout below the desktop breakpoint (or at it): what `matchMedia` answers. */
function viewport(desktop: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: desktop,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

const reads = () =>
  screen.getByRole("region", { name: "Read but not declared" });

describe("what needs attention", () => {
  it("lists undeclared reads for the selected system, and says None. without any", () => {
    render(<View />);
    fireEvent.click(
      screen.getByRole("button", { name: /read but not declared/ }),
    );
    expect(reads().textContent).toContain("SigninLogs");

    fireEvent.click(screen.getByRole("button", { name: /^elastic 1/ }));
    expect(reads().textContent).toContain("declared by no log source (0)");
    expect(within(reads()).getByText("None.")).toBeTruthy();
    expect(screen.queryByText("SigninLogs")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^sentinel 2/ }));
    expect(within(reads()).getByText("SigninLogs")).toBeTruthy();
  });

  it("names the log sources signals name that nothing declares, with their objectives", () => {
    render(<View />);
    const tile = screen.getByRole("button", { name: /read but not declared/ });
    expect(tile.textContent).toContain("1 more named by signals");
    fireEvent.click(tile);
    const section = screen.getByRole("region", {
      name: "Named by signals but not declared",
    });
    expect(section.textContent).toContain("Okta System Log");
    const objective = within(section).getByRole("button");
    fireEvent.click(objective);
    expect(screen.getByTestId("state").textContent).toContain(
      `|${OBJECTIVE_ID}`,
    );
  });

  it("explains a library that declares no log sources, still listing undeclared reads", () => {
    render(
      <View
        data={normalizeVisibility({
          version: "1.0",
          tlp: "amber",
          present: false,
          logsources: [],
          undeclared: [
            {
              system: "sentinel",
              name: "SigninLogs",
              rules: [RULE_ID],
              system_declares: false,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByText(/This library declares no log sources/).textContent,
    ).toBe(
      "This library declares no log sources (.opentide/configurations/visibility.toml).",
    );
    expect(screen.queryByRole("region", { name: "Overview" })).toBeNull();
    expect(screen.queryByLabelText("Search log sources")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Read but not declared" }).textContent,
    ).toContain("SigninLogs");
  });

  it("shows only the explanation when nothing is read either", () => {
    render(
      <View
        data={normalizeVisibility({
          version: "1.0",
          present: false,
          logsources: [],
        })}
      />,
    );
    expect(
      screen.getByText(/This library declares no log sources/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Read but not declared" }),
    ).toBeNull();
  });
});

describe("focus on a log source's page", () => {
  it("moves focus to the page's heading at the top, and back to its card", () => {
    const { container } = render(<View />);
    const scroller = container.querySelector<HTMLElement>(".overflow-y-auto")!;
    scroller.scrollTop = 480;

    const card = screen.getByRole("button", { name: /^SecurityEvent/ });
    fireEvent.click(card);
    const heading = within(
      screen.getByRole("article", { name: "Log source SecurityEvent" }),
    ).getByRole("heading", { name: "SecurityEvent" });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(scroller.scrollTop).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /all log sources/ }));
    expect(screen.queryByRole("article")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^SecurityEvent/ }),
    );
  });

  it("focuses the heading of a page opened from the inspector", () => {
    render(<View inspector />);
    fireEvent.click(
      screen.getByRole("button", { name: /SecurityEvent.*its query reads it/ }),
    );
    expect(document.activeElement?.textContent).toBe("SecurityEvent");
    expect(document.activeElement?.tagName).toBe("H2");
  });
});

describe("opening a log source from the inspector", () => {
  it("closes the inspector sheet below the desktop breakpoint", () => {
    viewport(false);
    render(<View inspector />);
    act(() => captured.actions!.select(RULE_ID));
    fireEvent.click(
      screen.getByRole("button", { name: /SecurityEvent.*its query reads it/ }),
    );
    // No selection: app-shell's sheet (`!desktop && selectedId`) closes.
    expect(screen.getByTestId("state").textContent).toBe("visibility|");
    expect(
      screen.getByRole("article", { name: "Log source SecurityEvent" }),
    ).toBeTruthy();
  });

  it("keeps the selection beside the page on the desktop", () => {
    viewport(true);
    render(<View inspector />);
    act(() => captured.actions!.select(RULE_ID));
    fireEvent.click(
      screen.getByRole("button", { name: /SecurityEvent.*its query reads it/ }),
    );
    expect(screen.getByTestId("state").textContent).toBe(
      `visibility|${RULE_ID}`,
    );
  });
});

describe("a Visibility address on a corpus without the export", () => {
  it("opens the graph on first load, and the address says so", () => {
    window.history.replaceState(null, "", "/?v=visibility&q=apt");
    render(<View withVisibility={false} />);
    expect(screen.getByTestId("state").textContent).toMatch(/^graph\|/);
    expect(window.location.search).toBe("?q=apt");
    expect(window.history.state).toEqual({ view: "graph" });
  });

  it("opens the graph when Back or Forward returns to one", () => {
    render(<View withVisibility={false} />);
    act(() => captured.actions!.setView("catalogue"));
    expect(screen.getByTestId("state").textContent).toMatch(/^catalogue\|/);

    // An entry a build with the export wrote, in the same tab.
    const state = { view: "visibility" };
    window.history.pushState(state, "", "/?v=visibility");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    expect(screen.getByTestId("state").textContent).toMatch(/^graph\|/);
    expect(window.location.search).toBe("");
    expect(window.history.state).toEqual({ view: "graph" });
  });
});
