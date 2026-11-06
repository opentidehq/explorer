import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
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
import { normalizeVisibility } from "@/lib/opentide/visibility";

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
});

function View({
  withVisibility = true,
  inspector = false,
}: {
  withVisibility?: boolean;
  inspector?: boolean;
}) {
  const catalog = buildCatalog(
    makeGraphFixtureBundle(),
    {},
    withVisibility ? visibility : null,
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
