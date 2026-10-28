import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// The credit line stays one line inside the frame, with the 40 px side margin, at the layouts the
// acceptance criteria name.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`the credit line fits at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/stage?case=${sharedCase()}`);
    await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
    const credit = page.locator("[data-budget=credit]");
    const box = await credit.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(40);
    expect(box?.height ?? 99).toBeLessThanOrEqual(16);
    await expect(credit).toContainText("© OpenStreetMap contributors.");
  });
}
