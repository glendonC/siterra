import { expect, test } from "@playwright/test";

// The data credits on every current screen (decision 5, 30 Oct 2026): one short line of the data's names stays
// visible inside the frame, and every credit and licence in full sits behind the Sources button (S), on the overview
// at the layouts the acceptance criteria name and on each data instrument.

const OVERVIEW = [
  "MODIS MOD13Q1 v6.1, NASA LP DAAC",
  "CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara",
  "© ESA WorldCover 2021, CC BY 4.0",
  "Produced using Copernicus WorldDEM-30",
];

const inFrame = (
  box: { x: number; y: number; width: number; height: number } | null,
  vw: number,
  vh: number,
) => {
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(24);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw - 24);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vh);
};

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the overview names its data and keeps every credit behind Sources at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/valley");
    await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
      timeout: 60_000,
    });
    const line = page.locator("[data-sources-line]");
    await expect(line).toHaveText(/^Data: NASA MODIS, CHIRPS, ESA WorldCover, Copernicus DEM/);
    // the drawn relief's exaggeration is said on the data line (decision 16)
    await expect(line.locator("[data-relief]")).toHaveText("Relief ×2.5");
    inFrame(await line.boundingBox(), viewport.width, viewport.height);
    await page.locator("[data-key-legend] [data-key='S']").click();
    const panel = page.locator("[data-sources-panel]");
    for (const text of OVERVIEW) await expect(panel).toContainText(text);
    inFrame(await panel.boundingBox(), viewport.width, viewport.height);
    // no credit anywhere is set in monospace
    expect(await panel.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i);
  });
}

for (const [name, credit] of [
  ["layers", "CHIRPS v3.0"],
  ["cutaway", "Auclair et al. 2011"],
  ["pixel", "Copernicus WorldDEM-30"],
  ["rainfall", "CHIRPS v3.0"],
] as const) {
  test(`the ${name} instrument names its data and keeps its credits behind Sources`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/instruments/${name}`);
    const line = page.locator("[data-sources-line]");
    await expect(line).toBeVisible({ timeout: 60_000 });
    await expect(line).toHaveText(/^Data: .+/);
    inFrame(await line.boundingBox(), 1440, 900);
    await page.keyboard.press("s");
    await expect(page.locator("[data-sources-panel]")).toContainText(credit);
  });
}
