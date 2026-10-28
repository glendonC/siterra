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

test("the Region Pack opens its layers, window, checks and truthful status from the records", async ({
  page,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const button = page.locator("[data-pack]");
  await expect(button).toHaveText("Region Pack · Real Data · Field Unverified");
  await button.click();
  const popover = page.locator("#pack-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Grazing and livelihoods in the Aït Bouguemez valley");
  await expect(popover.getByRole("listitem")).toHaveCount(11);
  await expect(popover).toContainText("Jan 2019 to Dec 2025, 84 months");
  await expect(popover).toContainText("11 of 11 bundles passed automated data checks.");
  await expect(popover).not.toContainText(/\bvalidated\b/i);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.PACK_OUT) await page.screenshot({ path: process.env.PACK_OUT });
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});
