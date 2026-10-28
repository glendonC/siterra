import { expect, test } from "@playwright/test";

// A returning visitor: a reload of the home page goes back to their case, not to the start of the opening.
test.use({ storageState: { cookies: [], origins: [] } });

test("a first visit opens with the opening, and a reload returns to the visitor's case", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-phase=opening]")).toBeVisible({ timeout: 60_000 });
  const caseId = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("siterra.demoCase") ?? "{}") as { caseId?: string }).caseId,
  );
  expect(caseId).toMatch(/^case_/);

  const asked: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/api\/(demo-sessions|cases\/[^/]+)$/.test(path)) asked.push(`${r.method()} ${path}`);
  });
  await page.reload();
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-phase]")).toHaveCount(0);
  // no new demo copy: only the visitor's own case is read (the session may read it again as events replay)
  expect(asked.length).toBeGreaterThan(0);
  expect(new Set(asked)).toEqual(new Set([`GET /api/cases/${caseId ?? ""}`]));
});
