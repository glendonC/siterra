import { expect, test, type Page } from "@playwright/test";
import { sharedCase } from "./demo-case";

// The catchment keeps the side margins of the approved u07 frame (16:9) at every layout the acceptance
// criteria name: its east tip never reaches the right edge.
async function sideMargins(page: Page) {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  return page.evaluate(() => {
    const path = document.querySelector<SVGPathElement>("svg path");
    const r = path?.getBoundingClientRect();
    const w = window.innerWidth;
    return r ? { left: r.left / w, right: (w - r.right) / w } : null;
  });
}

test("the catchment keeps the u07 side margins at 1440x900 and 1280x800", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  const approved = await sideMargins(page);
  expect(approved).not.toBeNull();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const m = await sideMargins(page);
    test.info().annotations.push({
      type: "margins",
      description: JSON.stringify({ viewport, approved, m }),
    });
    expect(m?.left ?? 0).toBeGreaterThanOrEqual((approved?.left ?? 1) - 0.01);
    expect(m?.right ?? 0).toBeGreaterThanOrEqual((approved?.right ?? 1) - 0.01);
  }
});
