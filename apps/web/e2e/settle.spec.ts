import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// MOT-01: on a first visit the camera starts at the regional view and moves once to the valley view; the
// names land after it; a reload in the same tab skips it.
test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("the arrival settles from the regional view once, and not again on reload", async ({
  page,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  const stage = page.locator("[data-settle]");
  await expect(stage).toHaveAttribute("data-settle", "moving", { timeout: 60_000 });
  await expect(page.locator("[data-budget=land-label]")).toHaveCount(0);
  const t0 = Date.now();
  // three frames of the move (start, middle, end) for the board; a screenshot is not an input
  const frames = process.env.SETTLE_FRAMES;
  if (frames) {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: `${frames}-start.png` });
    await page.waitForTimeout(1350 - (Date.now() - t0));
    await page.screenshot({ path: `${frames}-middle.png` });
  }
  await expect(stage).toHaveAttribute("data-settle", "done", { timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(3_500);
  if (frames) await page.screenshot({ path: `${frames}-end.png` });
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(page.locator("[data-stage-idle=true]")).toBeVisible({ timeout: 60_000 });
  await expect(stage).toHaveAttribute("data-settle", "done");
});

// MQ-02: any input during the move ends it at once; the arrival shows without its delays and the key
// still does its own job (F gives the flat reading).
test("a key during the settle ends it within a second, and the key still acts", async ({
  page,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  const stage = page.locator("[data-settle]");
  await expect(stage).toHaveAttribute("data-settle", "moving", { timeout: 60_000 });
  await page.keyboard.press("f");
  const t0 = Date.now();
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 1_000 });
  expect(Date.now() - t0).toBeLessThan(1_000);
  await expect(stage).toHaveAttribute("data-settle", "done");
  await expect(stage).toHaveAttribute("data-view", /^(toFlat|flat)$/, { timeout: 2_000 });
});

// A11Y-03, MQ-03: with reduced motion there is no move at all; the arrival starts at the valley view.
test("with reduced motion the settle never moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __settleSeen: string[] }).__settleSeen = seen;
    new MutationObserver(() => {
      const v = document.querySelector("[data-settle]")?.getAttribute("data-settle");
      if (v && seen.at(-1) !== v) seen.push(v);
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-settle"],
      childList: true,
    });
  });
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const seen = await page.evaluate(
    () => (window as unknown as { __settleSeen: string[] }).__settleSeen,
  );
  expect(seen).not.toContain("moving");
  expect(seen).not.toContain("waiting");
});
