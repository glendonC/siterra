import { expect, test, type Page, type Request } from "@playwright/test";

// The journey at "/" lands on the overview (approved specimen D4): Enter on the opening, Enter on the globe, then
// the dive ends on it; a returning
// visitor's reload goes straight to it, the old arrival's rail and cards no longer render, and the only write the
// page makes is the one demo session it opens on a first visit. Enter is never pressed in the ask here.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

/** Every request other than a GET. */
function writes(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() !== "GET") sent.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return sent;
}

async function overview(page: Page) {
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  await expect(page.locator("[data-overview] [data-finding]")).toHaveCount(5);
  // the old arrival is gone: no command line, no cards, no settled MapLibre valley
  await expect(page.locator("#command-input")).toHaveCount(0);
  await expect(page.locator("[data-arrival-settled]")).toHaveCount(0);
}

test("the opening, the globe and the dive land on the overview, and a reload returns straight to it", async ({
  page,
}) => {
  const sent = writes(page);
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=arrival]")).toBeVisible({ timeout: 90_000 });
  await overview(page);
  // the MapLibre valley is unmounted once the overview has faded in
  await expect(page.locator(".maplibregl-map")).toHaveCount(0);
  expect(sent).toEqual(["POST /api/demo-sessions"]);

  // a resumed visit: the stored demo copy, read again, with no new session
  sent.length = 0;
  await page.reload();
  await overview(page);
  await expect(page.locator("[data-phase]")).toHaveCount(0);
  expect(sent).toEqual([]);
});
