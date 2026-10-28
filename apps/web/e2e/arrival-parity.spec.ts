import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// Parity still: the arrival frame at 2560 x 1440 device pixels (1440 x 810 CSS at 16:9 device scale), the
// size of the approved hero stills. The screenshot goes beside the target frame for review; it is a
// review artefact, not a pixel comparison.
test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("arrival frame renders with every tile loaded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
  });
  await page.goto(`/stage?case=${sharedCase()}`);
  // the stage marks itself settled once the land is drawn and every part of the arrival has landed
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  // the development build's indicator is not part of the product frame
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({
    path: process.env.PARITY_OUT ?? "test-results/arrival-parity-2560x1440.png",
  });
  expect(errors).toEqual([]);
});
