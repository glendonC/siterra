import { expect, test } from "@playwright/test";
import { en } from "../lib/copy/en";
import { tm } from "../lib/copy/time";
import { atTheAnswer, crumbsOf, openView, readoutOn } from "./answer";

// Year by Year by its own address (UI-2): /instruments/time is the overview, which opens the view in place once the
// land is drawn; Esc returns at once to the overview at /valley, whose home is the answer. The second place opens it
// over its own drawn land (U25b: both places' records hold their land views); a case whose record holds no land view
// stays on its overview, and the address says so.

test.use({ viewport: { width: 1440, height: 900 } });

/** A band's snow line ("{share} under snow"), with any share. */
const SNOW = new RegExp(tm["time.snow"].text.replace("{share}", "\\d+%"));

test("the address opens Year by Year in place over the drawn land, and Esc returns to the answer at once", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/instruments/time");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  const view = page.locator("[data-time-view]");
  await expect(view).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/instruments\/time$/);
  expect((await crumbsOf(page)).slice(-2)).toEqual([
    en["overview.crumb.results"].text,
    en["overview.open.time"].text,
  ]);
  await expect(view.getByRole("slider")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/valley$/);
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
});

test("the second place opens Year by Year over its own drawn land, with no snow on its bands and no first-place words", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/instruments/time?case=case_calaveras_creek");
  const view = page.locator("[data-time-view]");
  await expect(view).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/instruments\/time\?case=case_calaveras_creek$/);
  await expect(page.locator("[data-crumbs]").last()).toContainText("Calaveras Creek catchment");
  // its record holds no snow layer it applies (the recipe recorded as not applicable): a winter month says no share
  // of any band under snow
  await expect(view).toHaveAttribute("data-playing", "", { timeout: 20_000 });
  await page.keyboard.press("Space");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(view.getByRole("slider")).toHaveAttribute("aria-valuenow", "12");
  await expect(view).not.toContainText(SNOW);
  expect(await page.locator("body").innerText()).not.toMatch(/Aït Bouguemez|March to June/);
  // a reload opens it again on the second place (UI-2: the address keeps the case)
  await page.reload();
  await expect(view).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/instruments\/time\?case=case_calaveras_creek$/);
  expect(await page.locator("body").innerText()).not.toMatch(/Aït Bouguemez|March to June/);
});

test("a case whose land is not drawn stays on its overview, under the overview's address", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // a synthetic case whose record holds no land view: the case's instrument listing answered with no instruments
  await page.route("**/api/cases/*/instruments*", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...body, instruments: [] } });
  });
  await page.goto("/instruments/time?case=case_calaveras_creek");
  await expect(page.locator("[data-overview-failed]")).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/valley\?case=case_calaveras_creek$/);
  await expect(page.locator("[data-time-view]")).toHaveCount(0);
});

test("reloading inside Year by Year opens it again over the drawn land; Home and End go to the track's ends", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await atTheAnswer(page);
  // opened from the answer's views (T on the answer is Analysis Steps, and only on a run's answer)
  await openView(page, "time");
  const view = page.locator("[data-time-view]");
  await expect(view).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/instruments\/time$/);
  await page.reload();
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await expect(view).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/instruments\/time$/);
  const slider = view.getByRole("slider");
  await page.keyboard.press("Space");
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuenow",
    (await slider.getAttribute("aria-valuemax")) ?? "",
  );
  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/valley$/);
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
});

test("a case whose land is drawn but holds no pixel seasons stays on its drawn overview, under the overview's address", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // the case's own snapshot without its pixel seasons bundle: Year by Year has nothing of the case's to play
  await page.route("**/api/cases/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    if (!res.ok()) return route.fulfill({ response: res });
    const snap = (await res.json()) as {
      records: { dataBundleRecords: { methodId: string }[] };
    };
    snap.records.dataBundleRecords = snap.records.dataBundleRecords.filter(
      (b) => b.methodId !== "pixel_seasons",
    );
    return route.fulfill({ response: res, json: snap });
  });
  await page.goto("/instruments/time");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await expect(page).toHaveURL(/\/valley$/);
  await expect(page.locator("[data-time-view]")).toHaveCount(0);
  // and Back has no entry that would open it
  await page.goBack().catch(() => undefined);
  await expect(page.locator("[data-time-view]")).toHaveCount(0);
});
