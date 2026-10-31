import { expect, test } from "@playwright/test";

// See It Over Time (specimen T, UI-2), in place over the overview's land: a trend finding offers it with T; it plays
// the seasons, Space pauses on a measured month, the arrow keys step a month, the band labels stand beside their
// bands, it ends on the trend, and Esc returns to the finding's overview. Values are the case's own records.

test.use({ viewport: { width: 1440, height: 900 } });

test("a trend finding opens See It Over Time with T; it plays, pauses on a month, steps, and Esc returns", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await page.locator("[data-finding='catchment']").click();
  // the finding's card offers it with its letter (decision 15)
  await expect(page.locator("[data-record] [data-actions]")).toContainText("See It Over TimeT");
  await page.mouse.move(720, 120);
  await page.keyboard.press("t");
  const view = page.locator("[data-time-view]");
  await expect(view).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/instruments\/time$/);
  await expect(page.getByRole("navigation").getByText("Over Time")).toBeVisible();
  // it plays: the playhead moves on its own
  const slider = view.getByRole("slider");
  await page.waitForTimeout(1500);
  const a = Number(await slider.getAttribute("aria-valuenow"));
  await page.waitForTimeout(800);
  const b = Number(await slider.getAttribute("aria-valuenow"));
  expect(b).toBeGreaterThan(a);
  // Space pauses on a month's centre; the arrow key steps one month
  await page.keyboard.press("Space");
  await expect(view).not.toHaveAttribute("data-playing", "");
  const at = Number(await slider.getAttribute("aria-valuenow"));
  expect(Number.isInteger(at)).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", String(Math.min(at + 1, 311)));
  // the readout names the season and the catchment's stored value; three band labels stand beside the land
  await expect(view.locator("[data-year]")).toHaveText(/^20\d\d$/);
  await expect(view.getByText(/NDVI, the catchment$/)).toBeVisible();
  await expect(view.locator("[data-change-year-mark='2011']")).toContainText("shift 2011");
  // End jumps to the trend end of the track: change-point timing (7C) and regional scan (7B) show
  await page.keyboard.press("End");
  await expect(view.locator("[data-change-timing]")).toHaveText(
    "Shift began around 2011 (1,165 pixels)",
  );
  await expect(view.locator("[data-regional-scan]")).toHaveText(
    "Regional scan (23,056 pixels): 24.0% in catchment, 8.6% outside",
  );
  await expect(view.locator("[data-band-change-year='2010']")).toContainText("rank 1, since 2010");
  await expect(view.locator("[data-band-change-year='2011']")).toContainText("rank 2, since 2011");
  await expect(view.locator("[data-band-change-year='2014']")).toContainText("rank 3, since 2014");
  // Esc returns to the overview
  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0, { timeout: 10_000 });
});
