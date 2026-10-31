import { expect, test } from "@playwright/test";

// See It Over Time by its own address (UI-2): /instruments/time is the overview, which opens the land's seasons in
// place once the land is drawn; Esc returns to the overview at /valley. A case whose land is not drawn stays on the
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

test("a case whose land is not drawn stays on its overview, under the overview's address", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/instruments/time?case=case_calaveras_creek");
  await expect(page.locator("[data-overview-failed]")).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/valley\?case=case_calaveras_creek$/);
  await expect(page.locator("[data-time-view]")).toHaveCount(0);
});
