import { expect, test, type Page } from "@playwright/test";

// CMP-20 and the UX architecture's viewport table: the departure legend shows bottom left while the layer
// shows, and at 1024 x 768 (below 1100 px) it collapses to a button, collapsed by default, so the map stays
// open. Runs on the replay path like the slice spec (.local worker on the synthetic replay); each test
// commissions its own demo copy.

async function observations(page: Page, baseURL: string | undefined) {
  const start = await page.request.post("/api/demo-sessions", {
    headers: { origin: baseURL ?? "" },
  });
  expect(start.status(), await start.text()).toBe(201);
  const { caseId } = (await start.json()) as { caseId: string };
  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-budget=card]")).toContainText("Complete. Findings:", {
    timeout: 60_000,
  });
}

test.describe("at 1024 x 768", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("the legend is a button, collapsed by default, clear of the catchment, and opens on demand", async ({
    page,
    baseURL,
  }) => {
    await observations(page, baseURL);
    const toggle = page.getByRole("button", { name: "Map Legend" });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const legend = page.locator("section[data-period-id]");
    await expect(legend).toBeHidden();
    const box = await toggle.boundingBox();
    expect(box?.height ?? 99).toBeLessThanOrEqual(44);
    // the catchment line is not drawn under the button (development stage hook, next dev only)
    const covered = await page.evaluate((b) => {
      const m = (
        window as unknown as {
          __siterraStage?: { queryRenderedFeatures(box: unknown, o: unknown): unknown[] };
        }
      ).__siterraStage;
      if (!m || !b) return null;
      return m.queryRenderedFeatures(
        [
          [b.x, b.y],
          [b.x + b.width, b.y + b.height],
        ],
        { layers: ["catchment-line"] },
      ).length;
    }, box);
    if (covered !== null) expect(covered).toBe(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("NDVI Departure · Nov 2025");
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (process.env.LEGEND_1024_OUT) await page.screenshot({ path: process.env.LEGEND_1024_OUT });
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(legend).toBeHidden();
  });
});

test.describe("at 1440 x 810", () => {
  test.use({ viewport: { width: 1440, height: 810 } });

  test("the legend is open, with no button", async ({ page, baseURL }) => {
    await observations(page, baseURL);
    await expect(page.locator("section[data-period-id]")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Map Legend" })).toBeHidden();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (process.env.LEGEND_1440_OUT) await page.screenshot({ path: process.env.LEGEND_1440_OUT });
  });
});
