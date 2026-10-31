import { expect, test } from "@playwright/test";

// The second place reads as itself (U25): a seed case named in the address opens that place's own demo copy, its
// names, area, question and seasons come from its own record and bundles, and nothing of the first place shows.

test.use({ viewport: { width: 1440, height: 900 } });

const FIRST = /Aït Bouguemez|Bouguemez|Tabant|High Atlas|March to June|September to May/;

test("the second place's overview is its own, and says plainly what its record does not hold yet", async ({
  page,
}) => {
  await page.goto("/valley?case=case_calaveras_creek");
  const root = page.locator("[data-overview-root]");
  await expect(root).toContainText("Calaveras Creek catchment", { timeout: 60_000 });
  await expect(root).toContainText(
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
  );
  await expect(root).toContainText("Creek catchment: 257.46 km²");
  // the record holds no land view yet: a blocked state, not a failure to retry, and no key for land not drawn
  await expect(page.locator("[data-overview-failed]")).toHaveText(
    "This case's record holds no view of its land yet, so the land is not drawn.",
  );
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the second place's rainfall view uses its own windows and axes", async ({ page }) => {
  await page.goto("/instruments/rainfall?case=case_calaveras_creek");
  const view = page.locator("[data-instrument='rainfall']");
  await expect(view.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(view).toContainText("October to April rainfall, mm");
  await expect(view).toContainText("February to May NDVI, catchment mean");
  await expect(view).toContainText("The four driest October to April totals");
  await expect(page.locator("[data-crumbs]").last()).toContainText("Calaveras Creek catchment");
  expect(await page.locator("body").innerText()).not.toMatch(FIRST);
});

test("the first place keeps its own seasons", async ({ page }) => {
  await page.goto("/instruments/rainfall?case=case_aitbouguemez");
  const view = page.locator("[data-instrument='rainfall']");
  await expect(view.locator("[data-season]").first()).toBeVisible({ timeout: 60_000 });
  await expect(view).toContainText("September to May rainfall, mm");
  await expect(view).toContainText("March to June NDVI, catchment mean");
});
