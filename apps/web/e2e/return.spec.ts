import { expect, test } from "@playwright/test";
import { readoutOn, shownLabels } from "./answer";

// A returning visitor: a reload of the home page goes back to their case, not to the start of the opening: the
// overview's home, the answer (UI-2).
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
  // straight to the overview, with no opening, globe or dive
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  await expect(readoutOn(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => shownLabels(page)).toBe(0);
  await expect(page.locator("[data-phase]")).toHaveCount(0);
  // no new demo copy: only the visitor's own case is read (the session may read it again as events replay)
  expect(asked.length).toBeGreaterThan(0);
  expect(new Set(asked)).toEqual(new Set([`GET /api/cases/${caseId ?? ""}`]));
});
