import { describe, expect, it } from "vitest";
import { resolveCodegenPolicy } from "./codegen-policy.mjs";

describe("resolveCodegenPolicy", () => {
  it("requires codegen when SPECIFICATIONS_REPO_ROOT is set", () => {
    const policy = resolveCodegenPolicy({
      specsDir: "/missing/specs",
      specsExist: false,
      specsRootSet: true,
      useFixture: false,
      skipCodegen: false,
    });
    expect(policy.required).toBe(true);
    expect(policy.skip).toBe(false);
  });

  it("requires codegen when a sibling specifications checkout exists", () => {
    const policy = resolveCodegenPolicy({
      specsDir: "/repo/specifications",
      specsExist: true,
      specsRootSet: false,
      useFixture: true,
      skipCodegen: false,
    });
    expect(policy.required).toBe(true);
    expect(policy.skip).toBe(false);
  });

  it("skips only for fixture corpus when specs are absent", () => {
    const policy = resolveCodegenPolicy({
      specsDir: "/repo/specifications",
      specsExist: false,
      specsRootSet: false,
      useFixture: true,
      skipCodegen: false,
    });
    expect(policy.skip).toBe(true);
    expect(policy.required).toBe(false);
  });

  it("does not skip when specs exist even if skip is requested", () => {
    const policy = resolveCodegenPolicy({
      specsDir: "/repo/specifications",
      specsExist: true,
      specsRootSet: true,
      useFixture: false,
      skipCodegen: true,
    });
    expect(policy.skip).toBe(false);
    expect(policy.required).toBe(true);
  });

  it("skips when specs are absent and the caller opts in", () => {
    const policy = resolveCodegenPolicy({
      specsDir: "/repo/specifications",
      specsExist: false,
      specsRootSet: false,
      useFixture: false,
      skipCodegen: true,
    });
    expect(policy.skip).toBe(true);
  });

  it("fails closed when a real corpus has no specifications", () => {
    const policy = resolveCodegenPolicy({
      specsDir: "/repo/specifications",
      specsExist: false,
      specsRootSet: false,
      useFixture: false,
      skipCodegen: false,
    });
    expect(policy.required).toBe(true);
    expect(policy.skip).toBe(false);
  });
});
