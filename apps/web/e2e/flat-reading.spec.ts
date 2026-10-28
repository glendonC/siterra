import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// MOT-12 "F Read flat": one camera move to top-down, north up, terrain off, with graticule ticks and a
// scale bar; F again returns to the beat's view. The text listing stays as a skip link on keyboard focus.
test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("F gives the flat reading with its frame, and F again returns", async ({ page }) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const stage = page.locator("[data-view]");
  await page.keyboard.press("f");
  await expect(stage).toHaveAttribute("data-view", "toFlat");
  await expect(stage).toHaveAttribute("data-view", "flat", { timeout: 5_000 });
  await expect(page.getByRole("button", { name: /Read flat/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const frame = page.locator("[data-flat-frame=true]");
  await expect(frame).toBeVisible();
  await expect(frame.locator("[data-scale-bar]")).toHaveAttribute("data-scale-bar", /^\d+ (km|m)$/);
  await expect(frame.getByText(/° W$/).first()).toBeVisible();
  await expect(frame.getByText(/° N$/).first()).toBeVisible();
  // the instruments follow: no relief factor, and the tick labels keep clear of the mode line
  await expect(page.locator("[data-budget=island]").getByText("Relief ×2")).toHaveCount(0);
  const mode = await page.getByRole("button", { name: /^Concept prototype/ }).boundingBox();
  for (const t of await frame.getByText(/° W$/).all()) {
    const b = await t.boundingBox();
    const apart =
      !mode ||
      !b ||
      b.x + b.width < mode.x ||
      b.x > mode.x + mode.width ||
      b.y > mode.y + mode.height;
    expect(apart).toBe(true);
  }
  // the names and stems leave the land in the flat reading
  await expect(page.locator("[data-budget=land-label]")).toHaveCount(0);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.FLAT_OUT) await page.screenshot({ path: process.env.FLAT_OUT });
  await page.keyboard.press("f");
  await expect(stage).toHaveAttribute("data-view", "oblique", { timeout: 5_000 });
  await expect(frame).toHaveCount(0);
  await expect(page.locator("[data-budget=land-label]").first()).toBeVisible();
  await expect(page.locator("[data-budget=island]").getByText("Relief ×2")).toHaveCount(1);
});

test("the text listing is a skip link on keyboard focus and a labelled region", async ({
  page,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const region = page.getByRole("region", { name: "Everything on screen, as text" });
  await expect(region).toBeAttached();
  await expect(region.getByText("Tabant", { exact: true })).toBeAttached();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to everything on screen, as text" });
  await expect(skip).toBeFocused();
  const box = await skip.boundingBox();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Enter");
  await expect(region).toBeFocused();
  const panel = await region.boundingBox();
  expect(panel?.width ?? 0).toBeGreaterThan(300);
});

test("when the map cannot load, the listing takes its place", async ({ page }) => {
  await page.route("**/api/map-assets", (r) => r.fulfill({ status: 503, body: "" }));
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "The interactive map could not load." }),
  ).toHaveText("The interactive map could not load. Everything it would show is listed below.");
  const region = page.getByRole("region", { name: "Everything on screen, as text" });
  await expect(region).toHaveAttribute("data-flat-listing", "shown");
  await expect(region.getByText("Tabant", { exact: true })).toBeVisible();
  // the message says the listing is below it
  const message = await page
    .getByRole("alert")
    .filter({ hasText: "The interactive map could not load." })
    .boundingBox();
  const listing = await region.boundingBox();
  expect((message?.y ?? 0) + (message?.height ?? 0)).toBeLessThanOrEqual(listing?.y ?? 0);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.FAILED_OUT) await page.screenshot({ path: process.env.FAILED_OUT });
});
