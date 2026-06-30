import { describe, expect, it } from "vitest";
import { clamp, readStoredPanelSize } from "@/lib/shell/panel-layout";

describe("panel-layout", () => {
  it("clamps values between min and max", () => {
    expect(clamp(10, 20, 40)).toBe(20);
    expect(clamp(50, 20, 40)).toBe(40);
    expect(clamp(30, 20, 40)).toBe(30);
  });

  it("returns fallback when storage is unavailable", () => {
    expect(readStoredPanelSize("missing", 280, 200, 400)).toBe(280);
  });
});
