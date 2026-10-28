import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/app/**/*.test.ts",
      "apps/*/lib/**/*.test.ts",
      "apps/*/components/**/*.test.ts",
      "apps/*/components/**/*.test.tsx",
    ],
    environment: "node",
  },
});
