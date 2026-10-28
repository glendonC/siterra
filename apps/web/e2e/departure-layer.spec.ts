import { expect, test, type Page } from "@playwright/test";

// MOT-04: once a request completes, the departure layer fades in and stays fully drawn on the relief. Over
// terrain maplibre-gl draws it into draped textures that a paint change does not redraw, so the check
// compares the valley as drawn with the valley after those textures are forced to redraw: they must match.
// Needs the development stage hook (next dev); runs on the replay path like the slice spec.

type Stage = {
  getLayer(id: string): unknown;
  getPaintProperty(layer: string, prop: string): unknown;
  getTerrain(): unknown;
  terrain: { tileManager: { releaseAllRTT(): void } } | null;
  triggerRepaint(): void;
  once(event: string, f: () => void): void;
};

async function observations(page: Page, baseURL: string | undefined) {
  const start = await page.request.post("/api/demo-sessions", {
    headers: { origin: baseURL ?? "" },
  });
  expect(start.status(), await start.text()).toBe(201);
  const { caseId } = (await start.json()) as { caseId: string };
  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-budget=card]")).toContainText("Request complete", {
    timeout: 60_000,
  });
  await expect(page.locator("section[data-period-id]")).toBeVisible({ timeout: 15_000 });
}

const idle = (page: Page, release: boolean) =>
  page.evaluate(
    (release) =>
      new Promise<void>((done) => {
        const m = (window as unknown as { __siterraStage: Stage }).__siterraStage;
        if (release) m.terrain?.tileManager.releaseAllRTT();
        m.once("idle", () => {
          done();
        });
        m.triggerRepaint();
      }),
    release,
  );

/** Mean absolute difference per colour channel (0 to 255) of two same-sized PNG screenshots. */
const difference = (page: Page, a: Buffer, b: Buffer) =>
  page.evaluate(
    async ([a, b]) => {
      const pixels = async (png: string) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${png}`)).blob(),
        );
        const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
        if (!c) throw new Error("no 2D canvas");
        c.drawImage(bitmap, 0, 0);
        return c.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [p, q] = [await pixels(a), await pixels(b)];
      let sum = 0;
      for (let i = 0; i < p.length; i++)
        if (i % 4 !== 3) sum += Math.abs((p[i] ?? 0) - (q[i] ?? 0));
      return sum / ((p.length / 4) * 3);
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );

/** The valley floor at 1440 x 810, where the departure colours are strongest. */
const VALLEY = { x: 450, y: 340, width: 500, height: 120 };

async function drawnInFull(page: Page) {
  const hook = await page.evaluate(() => "__siterraStage" in window);
  test.skip(!hook, "needs the development stage hook");
  // the fade is 160 ms; give it far longer, as the demo check did
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const m = (window as unknown as { __siterraStage: Stage }).__siterraStage;
    return {
      opacity: m.getPaintProperty("departure-raster", "raster-opacity"),
      terrain: Boolean(m.getTerrain()),
    };
  });
  expect(state).toEqual({ opacity: 1, terrain: true });
  await idle(page, false);
  const drawn = await page.screenshot({ clip: VALLEY });
  await idle(page, true);
  const redrawn = await page.screenshot({ clip: VALLEY });
  const d = await difference(page, drawn, redrawn);
  console.log(`departure layer: mean channel difference after a redraw ${d.toFixed(2)}`);
  expect(d, "the relief shows an earlier frame than the layer's opacity").toBeLessThan(1);
}

test.describe("at 1440 x 810", () => {
  test.use({ viewport: { width: 1440, height: 810 } });

  test("the departure colours on the relief are the fully drawn layer after a request", async ({
    page,
    baseURL,
  }) => {
    await observations(page, baseURL);
    await drawnInFull(page);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the layer appears at once, fully drawn", async ({ page, baseURL }) => {
      await observations(page, baseURL);
      await drawnInFull(page);
    });
  });
});
