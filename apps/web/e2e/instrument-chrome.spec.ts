import { expect, test, type Page } from "@playwright/test";

// The controls every screen after the opening shares (decisions 1 to 4, 30 Oct 2026): the breadcrumb with its back
// arrow, Esc one level back, R the view reset, S the sources, and the keys that work now, on the overview and in an
// instrument. Enter is never pressed in the ask here.

test.use({ viewport: { width: 1440, height: 900 } });

const crumbs = (page: Page) =>
  page
    .locator("[data-crumbs] li")
    .evaluateAll((els) => els.map((e) => e.textContent.replace("/", "").trim()));

test("the overview: one command bar, Esc one level at a time, R resets the view, S the sources, W the scope", async ({
  page,
}) => {
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  // no back button: the top left holds the place and its question; Esc is in the bar (HUD-2, decision A)
  expect(await crumbs(page)).toEqual(["Aït Bouguemez valley"]);
  await expect(page.locator("[data-crumbs] button")).toHaveCount(0);
  await expect(page.locator("[data-key-legend] [data-key]")).toHaveText([
    "↵See the Findings",
    "TAgents at Work",
    // species sightings key, where the case holds a species bundle (UI-2)
    "GSpecies",
    "/Ask",
    "RReset View",
    "SSources",
    "WLimits",
    "EscBack",
  ]);
  // nothing else floats on the overview: no thinking pill, no data line, no ask circle, no view cluster, no
  // bottom-left legend, no mode line
  for (const gone of [
    "[data-thinking-toggle]",
    "[data-sources-line]",
    "[data-ask]",
    "[data-view-control]",
    "[data-routes-entry]",
    "[data-verdict-entry]",
    "[data-mode-line]",
  ])
    await expect(page.locator(gone), gone).toHaveCount(0);
  // W says what Siterra does not do; Esc closes it before anything else
  await page.keyboard.press("w");
  await expect(page.locator("[data-scope-popover]")).toContainText(
    "Siterra does not contact people, spend money or make land decisions.",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-scope-popover]")).toHaveCount(0);
  await expect(page.locator("[data-overview-root]")).toBeVisible();
  // a finding opens one level down; Esc comes back up
  await page.locator("[data-finding='fdr']").click();
  await expect(page.locator("[data-record='fdr']")).toBeVisible();
  expect(await crumbs(page)).toEqual(["Aït Bouguemez valley", "24.7% greening"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-record]")).toHaveCount(0);
  expect(await crumbs(page)).toEqual(["Aït Bouguemez valley"]);
  // the wheel zooms; R puts the overview's pose back
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, -400);
  await expect(page.locator("[data-view-moved]")).toHaveCount(1);
  await page.keyboard.press("r");
  await expect(page.locator("[data-view-moved]")).toHaveCount(0);
  // S opens the sources; Esc closes them before it goes back a level
  await page.keyboard.press("s");
  await expect(page.locator("[data-sources-panel]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sources-panel]")).toHaveCount(0);
  await expect(page.locator("[data-overview-root]")).toBeVisible();
  // at the top level, Esc returns to the opening
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
});

test("an instrument: breadcrumb to its place, R and the view control on a 3D view, Esc back to the valley", async ({
  page,
}) => {
  await page.goto("/instruments/cutaway");
  await expect(page.locator("[data-band]").first()).toBeVisible({ timeout: 60_000 });
  expect(await crumbs(page)).toEqual(["Siterra", "Aït Bouguemez valley", "Cut through"]);
  await expect(page.locator("[data-view-control]")).toBeVisible();
  await expect(page.locator("[data-key-legend] [data-key]")).toHaveText([
    "EscBack",
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
  // decision 16: the card keeps the trend map's rule; the land shows the cells
  await expect(left.locator("[data-on-land]")).toHaveText(
    "Colors show each cell's trend, not which cells pass the check.",
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
  // a turned land clears the arc's labels; R brings the pose and the labels back
  await page.mouse.move(900, 500);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(900 - i * 8, 500);
  await page.mouse.up();
  await expect(page.locator("[data-view-moved]")).toHaveCount(1);
  await page.keyboard.press("r");
  await expect(page.locator("[data-view-moved]")).toHaveCount(0);
  await expect.poll(() => opacity("[data-finding='band']")).toBeGreaterThan(0.95);
});
