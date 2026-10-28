import { expect, test, type Page, type Request } from "@playwright/test";
import { demoCase } from "./demo-case";

// While a request runs, Esc stops it and Enter does nothing; the hint row says so.

const posts = (page: Page, pattern: RegExp) => {
  const seen: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && pattern.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
};

test("Esc stops a running request and Enter does not", async ({ page, baseURL }) => {
  const caseId = await demoCase(page.request, baseURL);
  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const commands = posts(page, /^\/api\/cases\/[^/]+\/commands$/);
  const cancels = posts(page, /^\/api\/commands\/[^/]+\/cancel$/);

  await page.locator("#command-input").press("Enter");
  const stop = page.locator("button[aria-keyshortcuts=Escape]");
  await expect(stop).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("button[aria-keyshortcuts=Enter]")).toHaveCount(0);

  await page.locator("body").press("Enter");
  expect(commands).toHaveLength(1);
  expect(cancels).toHaveLength(0);

  const cancel = page.waitForRequest((r) => /\/api\/commands\/[^/]+\/cancel$/.test(r.url()));
  await page.locator("body").press("Escape");
  await cancel;
  expect(cancels).toHaveLength(1);
});
