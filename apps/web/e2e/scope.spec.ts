import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// PC-04: the mode line is one line on the frame and opens the scope popover in one interaction; the
// popover carries the mode's detail line and what Siterra will not do.
test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });
test("the mode line opens the scope popover with the concept detail line", async ({ page }) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const mode = page.getByRole("button", {
    name: "Concept Prototype. Scope",
  });
  await expect(mode).toHaveText("Concept Prototype");
  const popover = page.locator("#scope-popover");
  await expect(popover).toBeHidden();
  await mode.focus();
  await page.keyboard.press("Enter");
  await expect(popover).toBeVisible();
  await expect(
    popover.getByText(
      "Model steps are synthetic examples, not live model output. The rainfall and vegetation records are measured.",
    ),
  ).toBeVisible();
  await expect(popover.getByText("Contact anyone, spend money, or publish anything")).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.SCOPE_OUT) await page.screenshot({ path: process.env.SCOPE_OUT });
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
});
