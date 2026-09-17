/**
 * Decide whether generate-mock-bundle must run schema codegen.
 *
 * Specs present (or SPECIFICATIONS_REPO_ROOT set) → hard error on failure.
 * Skip only for the fixture corpus or an explicit opt-in when specs are absent.
 */

/**
 * @param {{
 *   specsDir: string,
 *   specsExist: boolean,
 *   specsRootSet: boolean,
 *   useFixture: boolean,
 *   skipCodegen: boolean,
 * }} opts
 * @returns {{
 *   required: boolean,
 *   skip: boolean,
 *   reason: string,
 * }}
 */
export function resolveCodegenPolicy(opts) {
  if (opts.specsRootSet || opts.specsExist) {
    return {
      required: true,
      skip: false,
      reason: opts.specsRootSet
        ? "SPECIFICATIONS_REPO_ROOT is set"
        : `specifications found at ${opts.specsDir}`,
    };
  }

  if (opts.skipCodegen) {
    return {
      required: false,
      skip: true,
      reason: "OPENTIDE_SKIP_CODEGEN=1",
    };
  }

  if (opts.useFixture) {
    return {
      required: false,
      skip: true,
      reason: "fixture corpus and specifications not found",
    };
  }

  return {
    required: true,
    skip: false,
    reason: `specifications not found at ${opts.specsDir}`,
  };
}
