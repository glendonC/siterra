import { expect, test } from "@playwright/test";

// The data credits on every current screen (ported from the retired /stage credit-line check): the overview names
// the four sources it draws (MODIS NDVI, CHIRPS, WorldCover, the Copernicus DEM), inside the frame with its side
// margin, at the layouts the acceptance criteria name; each data instrument shows its credit line inside the frame.

const OVERVIEW = [
  "MODIS MOD13Q1 v6.1, NASA LP DAAC",
  "CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara",
  "© ESA WorldCover 2021, CC BY 4.0",
  "Produced using Copernicus WorldDEM-30",
];

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the overview credits its four sources inside the frame at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/valley");
    await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
      timeout: 60_000,
    });
    const credit = page.locator("[data-overview-root] [class*='credit']");
    for (const text of OVERVIEW) await expect(credit).toContainText(text);
    const box = await credit.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(24);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width - 24);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
  });
}

for (const name of ["layers", "cutaway", "pixel", "rainfall"]) {
  test(`the ${name} instrument shows its credit line inside the frame`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/instruments/${name}`);
    const credit = page.locator(`[data-instrument='${name}'] [class*='credit']`).first();
    await expect(credit).toBeVisible({ timeout: 60_000 });
    await expect(credit).not.toHaveText("");
    const box = await credit.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1440);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  });
}
