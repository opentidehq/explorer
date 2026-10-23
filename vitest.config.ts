import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["lib/**", "scripts/**", "bin/**", "components/**"],
      exclude: [
        "lib/opentide/generated/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.test.mjs",
        "**/test-fixtures.ts",
      ],
    },
    // CI checks out library/ and specifications/ inside the workspace; never run their tests.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "lib/**/*.test.ts",
            "scripts/**/*.test.mjs",
            "bin/**/*.test.mjs",
          ],
          // Pure modules: sharing workers halves the run, and shuffled runs pass.
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "happy-dom",
          include: ["components/**/*.test.tsx", "app/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
