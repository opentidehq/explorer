import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changelogSection, checkRelease } from "./release.mjs";

const changelog = `# Changelog

## [0.2.0] - 2026-07-01

Summary of two.

### Added

- Two.

## [0.1.0] - 2026-06-27

Summary of one.

[0.2.0]: https://example.com/compare
[0.1.0]: https://example.com/tag
`;

describe("changelogSection", () => {
  it("stops at the next version", () => {
    expect(changelogSection(changelog, "0.2.0")).toBe(
      "Summary of two.\n\n### Added\n\n- Two.",
    );
  });

  it("stops at the link references", () => {
    expect(changelogSection(changelog, "0.1.0")).toBe("Summary of one.");
  });

  it("finds no section for an unknown version", () => {
    expect(changelogSection(changelog, "0.3.0")).toBeNull();
  });
});

describe("checkRelease", () => {
  it("accepts a tag that matches the version and the changelog", () => {
    expect(checkRelease("v0.2.0", "0.2.0", changelog)).toEqual([]);
  });

  it("names each disagreement", () => {
    expect(checkRelease("v0.3.0", "0.2.0", changelog)).toHaveLength(1);
    expect(checkRelease("v0.3.0", "0.3.0", changelog)).toEqual([
      "CHANGELOG.md has no section for 0.3.0",
    ]);
  });

  it("holds for this repository's own version", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const { version } = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    const own = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    expect(checkRelease(`v${version}`, version, own)).toEqual([]);
  });
});
