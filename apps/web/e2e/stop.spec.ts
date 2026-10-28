import { expect, test, type Page, type Request } from "@playwright/test";
import { demoCase } from "./demo-case";

// The one Esc action in the activity panel. On the replay route the run ends on the server within a
// second, so Esc meets the replay still playing at reading pace and shows all its steps at once; Enter
// does nothing meanwhile. Esc on a request that is still running sends the cancel (hints.test.ts covers
// the choice of action; this spec sees the route the replay allows).

const posts = (page: Page, pattern: RegExp) => {
  const seen: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && pattern.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
};

test("Esc shows all steps of a paced replay at once, and Enter does nothing", async ({
  page,
  baseURL,
}) => {
  const caseId = await demoCase(page.request, baseURL);
  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  const commands = posts(page, /^\/api\/cases\/[^/]+\/commands$/);
  const cancels = posts(page, /^\/api\/commands\/[^/]+\/cancel$/);

  await page.locator("#command-input").press("Enter");
  const esc = page.locator("button[aria-keyshortcuts=Escape]");
  await expect(esc).toContainText("Show All Steps", { timeout: 10_000 });
  await expect(page.locator("button[aria-keyshortcuts=Enter]")).toHaveCount(0);

  await page.locator("body").press("Enter");
  expect(commands).toHaveLength(1);

  await page.locator("body").press("Escape");
  await expect(page.locator("[data-activity] li[data-record-ids]")).toHaveCount(3);
  await expect(page.locator("[data-replay=synthetic]")).not.toContainText("Reading pace");
  await expect(page.locator("[data-budget=card]")).toContainText("Complete. Findings:");
  await expect(esc).toHaveCount(0);
  // the run had already ended on the server: nothing to cancel
  expect(cancels).toHaveLength(0);
});
