import { describe, expect, it } from "vitest";
import { safeHttpUrl, safeMarkdownHref } from "@/lib/opentide/safe-href";

describe("safeHttpUrl", () => {
  it("keeps absolute web URLs", () => {
    expect(safeHttpUrl("https://github.com/OpenTideHQ/library")).toBe(
      "https://github.com/OpenTideHQ/library",
    );
    expect(safeHttpUrl(" http://example.com/a ")).toBe("http://example.com/a");
  });

  it("rejects scriptable and protocol-relative URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("//evil.example/phish")).toBeNull();
    expect(safeHttpUrl("/\\evil.example")).toBeNull();
    expect(safeHttpUrl("https://example.com/a b")).toBeNull();
  });
});

describe("safeMarkdownHref", () => {
  it("keeps web and relative links", () => {
    expect(safeMarkdownHref("https://example.com/doc")).toBe(
      "https://example.com/doc",
    );
    expect(safeMarkdownHref("./notes.md")).toBe("./notes.md");
    expect(safeMarkdownHref("#section")).toBe("#section");
  });

  it("drops scriptable and protocol-relative links", () => {
    expect(safeMarkdownHref("javascript:alert(1)")).toBeNull();
    expect(safeMarkdownHref("//evil.example")).toBeNull();
  });
});
