import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");

/** The `--tide-*` custom properties one theme block (`:root` or `.dark`) declares. */
function tokens(selector: string): Map<string, string> {
  const block = css.match(
    new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m"),
  )?.[1];
  if (!block) throw new Error(`no ${selector} block in globals.css`);
  return new Map(
    [...block.matchAll(/(--tide-[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.trim(),
    ]),
  );
}

const light = tokens(":root");
const dark = new Map([...light, ...tokens(".dark")]);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
  });
}

describe("theme tokens", () => {
  it.each([
    ["light", light],
    ["dark", dark],
  ])("gives warn and danger text 4.5:1 on the panel (%s)", (_theme, theme) => {
    const panel = theme.get("--tide-panel")!;
    const ratios = Object.fromEntries(
      ["--tide-warn", "--tide-danger"].map((name) => {
        const value = theme.get(name) ?? "";
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
        return [name, contrast(value, panel) >= 4.5];
      }),
    );
    expect(ratios).toEqual({ "--tide-warn": true, "--tide-danger": true });
  });

  it("gives Tailwind the warn and danger colours (text-warn, border-danger/50)", () => {
    expect(css).toContain("--color-warn: var(--tide-warn);");
    expect(css).toContain("--color-danger: var(--tide-danger);");
  });

  it("defines every --tide-* token the app reads", () => {
    const used = new Set(
      ["app", "components"]
        .flatMap((dir) => walk(path.join(ROOT, dir)))
        .flatMap((file) => [
          ...fs.readFileSync(file, "utf8").matchAll(/var\((--tide-[\w-]+)/g),
        ])
        .map((m) => m[1]!),
    );
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((name) => !light.has(name))).toEqual([]);
  });
});
