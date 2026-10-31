import { expect, test } from "@playwright/test";

// See It Over Time by its own address (UI-2): /instruments/time is the overview, which opens the land's seasons in
// place once the land is drawn; Esc returns to the overview at /valley. The second place opens it over its own drawn
// land (U25b: both places' records hold their land views); a case whose record holds no land view stays on its
// overview, and the address says so.

test.use({ viewport: { width: 1440, height: 900 } });

test("the address opens See It Over Time in place over the drawn land, and Esc returns to the overview", async ({
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
  await expect(page.getByRole("navigation").getByText("Over Time")).toBeVisible();
  await expect(view.getByRole("slider")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/valley$/);
});

test("the second place opens See It Over Time over its own drawn land, with no first-place words", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/instruments/time?case=case_calaveras_creek");
  const view = page.locator("[data-time-view]");
  await expect(view).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/instruments\/time\?case=case_calaveras_creek$/);
  await expect(view).toContainText("No snow layer");
  expect(await page.locator("body").innerText()).not.toMatch(/Aït Bouguemez|March to June/);
  // a reload opens it again on the second place (UI-2: the address keeps the case)
  await page.reload();
  await expect(view).toBeVisible({ timeout: 90_000 });
  await expect(view).toContainText("No snow layer");
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

test("reloading inside See It Over Time opens it again over the drawn land; Home and End go to the track's ends", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await page.locator("[data-finding='catchment']").click();
  await page.mouse.move(720, 120);
  await page.keyboard.press("t");
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
});
