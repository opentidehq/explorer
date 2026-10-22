import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // CI checks out library/ and specifications/ inside the workspace; never run their tests.
    include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs", "bin/**/*.test.mjs"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
