import { expect, test } from "@playwright/test";

// A visitor with no session and no stored demo copy: the page starts a demo session before it asks for
// any case, so no request answers 401 and the console stays free of errors.
test.use({ storageState: { cookies: [], origins: [] } });

test("a first visit opens a demo copy without a 401 or a console error", async ({ page }) => {
  const unauthorised: string[] = [];
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("response", (r) => {
    if (r.status() === 401) unauthorised.push(r.url());
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/stage");
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  expect(unauthorised).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests[0]).toBe("POST /api/demo-sessions");
  expect(requests[1]).toMatch(/^GET \/api\/cases\/case_/);
});
