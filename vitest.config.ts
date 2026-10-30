import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/app/**/*.test.ts",
      "apps/*/lib/**/*.test.ts",
      "apps/*/eval/**/*.test.ts",
      "apps/*/components/**/*.test.ts",
      "apps/*/components/**/*.test.tsx",
    ],
    environment: "node",
    // The seed tests read every bundle of a place; with 150 files running at once the default 5 s is not enough.
    testTimeout: 30_000,
  },
});
