import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// ADR-0018: the browser asks only the app's own origin. The map bundle comes through /api/map-assets,
// whose 307 lands on the versioned manifest every asset path resolves against.
test("the arrival asks only the app's own origin, and reads the map through /api/map-assets", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "").origin;
  const others: string[] = [];
  const mapPaths: string[] = [];
  const missing: string[] = [];
  // a map asset the bundle lacks answers 404 and MapLibre draws it grey (AUDIT B b53)
  page.on("response", (r) => {
    if (r.url().includes("/api/map-assets/") && r.status() === 404) missing.push(r.url());
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (u.origin !== origin) others.push(r.url());
    else if (u.pathname.startsWith("/api/map-assets")) mapPaths.push(u.pathname);
  });
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  // and in the flat reading, which reaches the higher zooms
  await page.keyboard.press("f");
  await expect(page.locator("[data-view]")).toHaveAttribute("data-view", "flat", {
    timeout: 5_000,
  });
  await page.waitForTimeout(1500);
  expect(others).toEqual([]);
  expect(missing).toEqual([]);
  expect(mapPaths[0]).toBe("/api/map-assets");
  expect(
    mapPaths.some((p) => /^\/api\/map-assets\/[0-9a-f]{64}\/terrain\/\d+\/\d+\/\d+\.webp$/.test(p)),
  ).toBe(true);
});
