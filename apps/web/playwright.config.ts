import { defineConfig } from "@playwright/test";

// End-to-end checks and parity stills against a running web server: the UI lane's dev server
// (127.0.0.1:4370) unless SITERRA_WEB_URL names another. SITERRA_WEB_SERVER says which kind it is: "dev"
// (next dev, the default) or "production" (next start). Chromium runs on the GPU through ANGLE and Metal, as the
// design lanes rendered the approved frames.
const server = process.env.SITERRA_WEB_SERVER ?? "dev";
if (server !== "dev" && server !== "production")
  throw new Error('SITERRA_WEB_SERVER must be "dev" or "production"');

export default defineConfig({
  testDir: "e2e",
  // reports and failure traces stay in the lane's ignored folder, out of the tree and the format check
  outputDir: "../../.local/playwright/test-results",
  timeout: 120_000,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.SITERRA_WEB_URL ?? "http://127.0.0.1:4370",
    // the shared demo session from global-setup.ts
    storageState: "../../.local/playwright/demo-storage.json",
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "app" }],
});
