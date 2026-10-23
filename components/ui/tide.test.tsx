import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Segmented, VocabValue } from "@/components/ui/tide";

const VIEWS = [
  { value: "graph", label: "Graph" },
  { value: "catalogue", label: "Catalogue" },
  { value: "attack", label: "ATT&CK" },
] as const;

function Views({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<string>("graph");
  return (
    <Segmented
      label="View"
      value={value}
      options={[...VIEWS]}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("Segmented", () => {
  it("is a tab list with the chosen tab selected and the only one in tab order", () => {
    render(<Views />);
    expect(screen.getByRole("tablist", { name: "View" })).toBeTruthy();
    const graph = screen.getByRole("tab", { name: "Graph" });
    const attack = screen.getByRole("tab", { name: "ATT&CK" });
    expect(graph.getAttribute("aria-selected")).toBe("true");
    expect(graph.tabIndex).toBe(0);
    expect(attack.getAttribute("aria-selected")).toBe("false");
    expect(attack.tabIndex).toBe(-1);
  });

  it("selects a tab on click", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<Views onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Catalogue" }));
    expect(onChange).toHaveBeenCalledWith("catalogue");
    expect(
      screen
        .getByRole("tab", { name: "Catalogue" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("moves with the arrow keys, wrapping at the ends, and takes focus along", () => {
    render(<Views />);
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    const attack = screen.getByRole("tab", { name: "ATT&CK" });
    expect(attack.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(attack);
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Graph" }),
    );
  });

  it("is a toggle group with pressed buttons when asked", () => {
    render(
      <Segmented
        role="group"
        label="Reach"
        value="matches"
        options={[
          { value: "matches", label: "Matches" },
          { value: "chains", label: "Chains" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("group", { name: "Reach" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Matches" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("VocabValue", () => {
  it("allows a line break only after each :: separator", () => {
    const { container } = render(<VocabValue value="misp::actor::APT29" />);
    expect(container.textContent).toBe("misp::actor::APT29");
    expect(container.querySelectorAll("wbr")).toHaveLength(2);
    expect(
      [...container.querySelectorAll("span")].map((span) => span.textContent),
    ).toEqual(["misp::", "actor::", "APT29"]);
  });
});
