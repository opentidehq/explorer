import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // CI checks out library/ and specifications/ inside the workspace; never run their tests.
    include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs", "bin/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["lib/**", "scripts/**", "bin/**"],
      exclude: [
        "lib/opentide/generated/**",
        "**/*.test.ts",
        "**/*.test.mjs",
        "**/test-fixtures.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
