import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CodePanel,
  findingsSummary,
  type PanelAnalysis,
} from "@/components/code/code-panel";
import { ObjectChecks } from "@/components/explorer/inspector/object-checks";
import { ExplorerProvider } from "@/components/explorer/explorer-state";
import { buildCatalog } from "@/lib/explorer/catalog";
import { RULE_ID, makeGraphFixtureBundle } from "@/lib/graph/test-fixtures";
import type { Diagnostic } from "@/lib/lsp/protocol";

const code = "SecurityEvent | wher EventID == 4688";
const typo: Diagnostic = {
  severity: 1,
  code: "kql_unknown_operator",
  message: "unknown tabular operator 'wher'",
  range: {
    start: { line: 0, character: 16 },
    end: { line: 0, character: 20 },
  },
};

const analysis = (hover: PanelAnalysis["hover"]): PanelAnalysis => ({
  tokens: [
    { line: 0, character: 0, length: 13, type: "type" },
    { line: 0, character: 21, length: 7, type: "property" },
  ],
  diagnostics: [typo],
  hover,
});

describe("CodePanel with the language server's analysis", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("colours server tokens, underlines findings and counts them", () => {
    const { container } = render(
      <CodePanel
        code={code}
        language="query"
        caption="sentinel · query"
        analysis={analysis(async () => null)}
      />,
    );
    expect(container.querySelector(".tok-type")?.textContent).toBe(
      "SecurityEvent",
    );
    expect(container.querySelector(".diag-1")?.textContent).toBe("wher");
    expect(screen.getByText("1 error")).toBeTruthy();
  });

  it("shows the server's hover and the findings under the pointer", async () => {
    const hover = vi.fn<NonNullable<PanelAnalysis["hover"]>>(
      async () => "**SecurityEvent** table",
    );
    const { container } = render(
      <CodePanel
        code={code}
        language="query"
        caption="q"
        analysis={analysis(hover)}
      />,
    );
    const token = container.querySelector<HTMLElement>("[data-t='1']")!;
    fireEvent.pointerOver(token);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(hover).toHaveBeenCalledWith({ line: 0, character: 0 });
    expect(screen.getByRole("tooltip").textContent).toContain("SecurityEvent");

    fireEvent.pointerOver(container.querySelector<HTMLElement>(".diag-1")!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole("tooltip").textContent).toContain(
      "unknown tabular operator",
    );
  });

  it("keeps the regex highlighter without an analysis", () => {
    const { container } = render(
      <CodePanel code={code} language="query" caption="q" />,
    );
    expect(container.querySelector("[data-t]")).toBeNull();
    expect(container.querySelector(".diag")).toBeNull();
  });
});

describe("findingsSummary", () => {
  it("names each severity that occurs", () => {
    expect(findingsSummary([])).toBe("");
    expect(
      findingsSummary([
        typo,
        typo,
        { ...typo, severity: 2 },
        { ...typo, severity: 4 },
      ]),
    ).toBe("2 errors · 1 warning · 1 note");
  });
});

describe("ObjectChecks", () => {
  it("says so when the language server cannot start", async () => {
    // No module worker in this DOM: the service reports the server unavailable.
    vi.stubGlobal("Worker", function Worker() {
      throw new Error("module workers are not supported");
    });
    const bundle = makeGraphFixtureBundle();
    const catalog = buildCatalog(bundle, {}, null);
    render(
      <ExplorerProvider catalog={catalog}>
        <ObjectChecks
          summary={catalog.summaries.get(RULE_ID)!}
          body={bundle.flatIndex[RULE_ID]!}
        />
      </ExplorerProvider>,
    );
    expect(
      await screen.findByText(/language server is not available/),
    ).toBeTruthy();
    expect(screen.getByText(/module workers are not supported/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
