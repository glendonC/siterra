import { expect, test } from "@playwright/test";

// The data credits on every current screen (decision 5, 30 Oct 2026): every credit and licence in full sits behind the
// Sources key (S), one step away. On the overview (HUD-2, decision A, 2 Nov 2026) no data line stays on the screen: the
// names, licences and the drawn relief's exaggeration are all inside Sources; each data instrument keeps its line.

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
  test(`the overview keeps every credit and the relief's exaggeration one key away, in Sources, at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/valley");
    await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
      timeout: 60_000,
    });
    await expect(page.locator("[data-sources-line]")).toHaveCount(0);
    await page.locator("[data-key-legend] [data-key='S']").click();
    const panel = page.locator("[data-sources-panel]");
    for (const text of OVERVIEW) await expect(panel).toContainText(text);
    // the drawn relief's exaggeration is said with the credits (decision 16, moved by decision A)
    await expect(panel.locator("[data-relief]")).toHaveText(
      "The land's height is drawn 2.5 times its true scale.",
    );
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
