import { expect, test } from "@playwright/test";
import { en } from "../lib/copy/en";
import { tm } from "../lib/copy/time";
import { atTheAnswer, crumbsOf, openView, readoutOn, shaped } from "./answer";

// Year by Year (specimen T, UI-2), in place over the overview's land, opened from the answer's views: it plays the
// years, Space pauses on a measured month, the arrow keys step a month, each year says where it stands among the
// record's years, it ends on the trend over the whole record, and Esc comes straight back to the answer. Its words
// are lib/copy/time.ts's around the case's own records (lib/time/words.ts computes and tests the numbers).

test.use({ viewport: { width: 1440, height: 900 } });

/** Where a year stands among the record's years, in any of the catalog's ways of saying it. */
const STANDING = shaped(
  tm["time.green.most"].text,
  tm["time.green.nth"].text,
  tm["time.green.least"].text,
  tm["time.green.nthLeast"].text,
  tm["time.green.above"].text,
  tm["time.green.below"].text,
  tm["time.tied.one"].text,
  tm["time.tied.many"].text,
  tm["time.noValue"].text,
);

test("the answer's views open Year by Year: it plays, pauses on a month, steps, says where each year stands, ends on the trend, and Esc comes back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await atTheAnswer(page);
  await openView(page, "time");
  await page.mouse.move(720, 120);
  const view = page.locator("[data-time-view]");
  await expect(view).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/instruments\/time$/);
  // its crumb is its name, under the answer's
  expect((await crumbsOf(page)).slice(-2)).toEqual([
    en["overview.crumb.results"].text,
    en["overview.open.time"].text,
  ]);
  // it plays on arrival: the playhead moves on its own
  const slider = view.getByRole("slider");
  await expect(view).toHaveAttribute("data-playing", "", { timeout: 20_000 });
  const a = Number(await slider.getAttribute("aria-valuenow"));
  await expect
    .poll(async () => Number(await slider.getAttribute("aria-valuenow")), { timeout: 5_000 })
    .toBeGreaterThan(a);
  // Space pauses on a month and the playhead stays there; the arrow key steps one month
  await page.keyboard.press("Space");
  await expect(view).not.toHaveAttribute("data-playing", "");
  const at = await slider.getAttribute("aria-valuenow");
  await page.waitForTimeout(600);
  await expect(slider).toHaveAttribute("aria-valuenow", at ?? "");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", String(Number(at) + 1));
  // the year, where it stands among the record's years, and what the greenness is
  await expect(view.locator("[data-year]")).toHaveText(/^(?:19|20)\d\d$/);
  await expect(view.locator("[data-year-place]")).toHaveText(STANDING);
  await expect(view.getByText(shaped(tm["time.measure"].text))).toBeVisible();
  await expect(view.getByText(shaped(tm["time.dryKey"].text))).toBeVisible();
  // End: the trend over the whole record, the shares that greened and browned, and when half the greening came
  await page.keyboard.press("End");
  const trend = view.locator("[data-trend-state]");
  await expect(trend).toBeVisible();
  await expect(trend.locator("[data-shares]")).toHaveText(
    shaped(tm["time.shares.both"].text, tm["time.shares.none"].text),
  );
  const word = trend.locator("[data-trend]");
  if (await word.count())
    await expect(word).toHaveText(
      shaped(tm["time.greener"].text, tm["time.browner"].text, tm["time.unclear"].text),
    );
  const timing = trend.locator("[data-change-timing]");
  if (await timing.count()) await expect(timing).toHaveText(shaped(tm["time.steps"].text));
  // no raw index value or ranks of pixels left on the view
  expect(await view.innerText()).not.toMatch(/NDVI per decade|pixels\)|Regional scan|rank \d/);
  // Esc: the answer, at once
  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0, { timeout: 10_000 });
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
  await expect(page).toHaveURL(/\/valley$/);
});
