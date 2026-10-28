import { defineConfig } from "@playwright/test";

// End-to-end checks and parity stills against the UI lane's dev server (127.0.0.1:4370). Chromium runs on
// the GPU through ANGLE and Metal, as the design lanes rendered the approved frames.
export default defineConfig({
  testDir: "e2e",
  // reports and failure traces stay in the lane's ignored folder, out of the tree and the format check
  outputDir: "../../.local/playwright/test-results",
  timeout: 120_000,
  use: {
    baseURL: process.env.SITERRA_WEB_URL ?? "http://127.0.0.1:4370",
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  },
});
