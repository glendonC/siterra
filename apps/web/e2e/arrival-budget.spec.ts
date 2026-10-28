import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";
import { checkBudget } from "../lib/budget/measure";
import { collectBudget } from "./budget";

// VC-04 and VC-05 for the arrival state at the two layouts the acceptance criteria name.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`arrival stays within the visual budget at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/stage?case=${sharedCase()}`);
    await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
    const report = checkBudget(await collectBudget(page), viewport, "arrival");
    test.info().annotations.push({ type: "budget", description: JSON.stringify(report) });
    expect(report.violations).toEqual([]);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (process.env.BUDGET_SHOT_DIR) {
      await page.screenshot({
        path: `${process.env.BUDGET_SHOT_DIR}/arrival-${String(viewport.width)}x${String(viewport.height)}.png`,
      });
    }
  });
}
