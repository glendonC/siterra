import { expect, test, type Page, type Request } from "@playwright/test";

// The question box: what the viewer types is what the request asks, sent by Enter in the box or by the
// primary action, and the card heads with it. Runs on the replay path like the slice spec.

async function arrive(page: Page, baseURL: string | undefined) {
  const start = await page.request.post("/api/demo-sessions", {
    headers: { origin: baseURL ?? "" },
  });
  expect(start.status(), await start.text()).toBe(201);
  const { caseId } = (await start.json()) as { caseId: string };
  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
}

const commandPost = (page: Page) =>
  page.waitForRequest(
    (r: Request) => r.method() === "POST" && /\/api\/cases\/[^/]+\/commands$/.test(r.url()),
  );

const ASKED = "Has the valley floor become less green since 2019?";

test("Enter in the question box sends the typed question and the card heads with it", async ({
  page,
  baseURL,
}) => {
  await arrive(page, baseURL);
  const box = page.locator("#command-input");
  await box.fill(ASKED);
  const sent = commandPost(page);
  await box.press("Enter");
  expect(((await sent).postDataJSON() as { text: string }).text).toBe(ASKED);
  await expect(page.locator("[data-budget=card]")).toContainText(ASKED, { timeout: 30_000 });
});

test("the primary action sends the typed question, not the case question", async ({
  page,
  baseURL,
}) => {
  await arrive(page, baseURL);
  await page.locator("#command-input").fill(ASKED);
  const sent = commandPost(page);
  await page.locator("[data-budget=action]").click();
  expect(((await sent).postDataJSON() as { text: string }).text).toBe(ASKED);
});
