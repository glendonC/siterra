import { expect, test, type Page } from "@playwright/test";

// The controls every screen after the opening shares (decisions 1 to 4, 30 Oct 2026): the breadcrumb with its back
// arrow, Esc one level back, R the view reset, S the sources, and the keys that work now, on the overview and in an
// instrument. Enter is never pressed in the ask here.

test.use({ viewport: { width: 1440, height: 900 } });

const crumbs = (page: Page) =>
  page
    .locator("[data-crumbs] li")
    .evaluateAll((els) => els.map((e) => e.textContent.replace("/", "").trim()));

test("the overview: breadcrumb, Esc one level at a time, R resets the view, S the sources", async ({
  page,
}) => {
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  expect(await crumbs(page)).toEqual(["Siterra", "Aït Bouguemez valley"]);
  await expect(page.locator("[data-key-legend] [data-key]")).toHaveText([
    "EscBack",
    "RReset View",
    "/Ask",
    "SSources",
  ]);
  // a finding opens one level down; Esc comes back up
  await page.locator("[data-finding='fdr']").click();
  await expect(page.locator("[data-record='fdr']")).toBeVisible();
  expect(await crumbs(page)).toEqual(["Siterra", "Aït Bouguemez valley", "24.7% greening"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-record]")).toHaveCount(0);
  expect(await crumbs(page)).toEqual(["Siterra", "Aït Bouguemez valley"]);
  // the view control zooms; R puts the overview's pose back
  await page.locator("[data-view-control]").getByRole("button", { name: "Zoom In" }).click();
  await expect(page.locator("[data-view-moved]")).toHaveCount(1);
  await page.keyboard.press("r");
  await expect(page.locator("[data-view-moved]")).toHaveCount(0);
  // S opens the sources; Esc closes them before it goes back a level
  await page.keyboard.press("s");
  await expect(page.locator("[data-sources-panel]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sources-panel]")).toHaveCount(0);
  await expect(page.locator("[data-overview-root]")).toBeVisible();
  // at the top level, the back arrow returns to the opening
  await page.locator("[data-crumbs]").getByRole("button", { name: "Back" }).click();
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
});

test("an instrument: breadcrumb to its place, R and the view control on a 3D view, Esc back to the valley", async ({
  page,
}) => {
  await page.goto("/instruments/cutaway");
  await expect(page.locator("[data-band]").first()).toBeVisible({ timeout: 60_000 });
  expect(await crumbs(page)).toEqual(["Siterra", "Aït Bouguemez valley", "Cutaway"]);
  await expect(page.locator("[data-view-control]")).toBeVisible();
  await expect(page.locator("[data-key-legend] [data-key]")).toHaveText([
    "EscBack",
    "RReset View",
    "/Ask",
    "SSources",
  ]);
  await page.keyboard.press("s");
  await expect(page.locator("[data-sources-panel]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sources-panel]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley$/);
});

test("a flat instrument offers no view control and no R", async ({ page }) => {
  await page.goto("/instruments/rainfall");
  await expect(page.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-view-control]")).toHaveCount(0);
  await expect(page.locator("[data-key-legend] [data-key]")).toHaveText([
    "EscBack",
    "/Ask",
    "SSources",
  ]);
});

test("a finding opens on its own side with its footprint named, and a turned land clears the arc", async ({
  page,
}) => {
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  // 24.7% sits on the arc's left: its record opens on the left, with the slope key and what the land shows
  await page.locator("[data-finding='fdr']").click();
  const left = page.locator("[data-record='fdr']");
  await expect(left).toHaveAttribute("data-side", "left");
  await expect(left.locator("[data-slope-key]")).toBeVisible();
  await expect(left.locator("[data-on-land]")).toContainText(
    "The share comes from the false discovery rate check over all 8,094 cells; the map marks no cell as significant.",
  );
  // no ring label stays while a record is open, and the case question steps aside for a record on the left
  const opacity = (sel: string) =>
    page.locator(sel).evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(() => opacity("[data-case-question]")).toBeLessThan(0.05);
  await expect.poll(() => opacity("[data-finding='band']")).toBeLessThan(0.05);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-record]")).toHaveCount(0);
  await expect.poll(() => opacity("[data-case-question]")).toBeGreaterThan(0.95);
  // the pixel sits on the right: its record opens on the right, and the question stays
  await page.locator("[data-finding='pixel']").click();
  await expect(page.locator("[data-record='pixel']")).toHaveAttribute("data-side", "right");
  await expect.poll(() => opacity("[data-case-question]")).toBeGreaterThan(0.95);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-record]")).toHaveCount(0);
  // a turned land: the ask steps back; R brings it back
  const ask = page.locator("[data-ask]");
  await page.mouse.move(900, 500);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(900 - i * 8, 500);
  await page.mouse.up();
  await expect
    .poll(() => ask.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(0.05);
  await page.keyboard.press("r");
  await expect
    .poll(() => ask.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.95);
});
