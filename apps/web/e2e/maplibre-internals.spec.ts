import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

// At runtime, the transform the stage projects with exists and has the shape the projection expects
// (see lib/checks/maplibre-internals.test.ts for the declarations).
test("map._camera.transform gives a 4 x 4 matrix and a world size", async ({ page }) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-stage-idle=true]")).toBeVisible({ timeout: 60_000 });
  const shape = await page.evaluate(() => {
    const m = (window as unknown as { __siterraStage?: { _camera?: { transform?: unknown } } })
      .__siterraStage;
    const t = m?._camera?.transform as
      { modelViewProjectionMatrix?: ArrayLike<number>; worldSize?: number } | undefined;
    return { matrix: t?.modelViewProjectionMatrix?.length ?? null, worldSize: typeof t?.worldSize };
  });
  expect(shape, "map._camera.transform changed shape: recheck lib/stage/project.ts").toEqual({
    matrix: 16,
    worldSize: "number",
  });
});

// SC-04 for the flat reading: once settled, the map is top-down, north up, with terrain off.
test("the flat reading is pitch 0, bearing 0, terrain off", async ({ page }) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("f");
  await expect(page.locator("[data-view]")).toHaveAttribute("data-view", "flat", {
    timeout: 5_000,
  });
  const state = await page.evaluate(() => {
    const m = (
      window as unknown as {
        __siterraStage?: { getPitch(): number; getBearing(): number; getTerrain(): unknown };
      }
    ).__siterraStage;
    return m ? { pitch: m.getPitch(), bearing: m.getBearing(), terrain: m.getTerrain() } : null;
  });
  expect(state).toEqual({ pitch: 0, bearing: 0, terrain: null });
});

// MQ-02 at the camera: a key during the arrival settle puts the camera at the valley view at once.
test("a key during the settle jumps the camera to the valley view", async ({ page }) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-settle]")).toHaveAttribute("data-settle", "moving", {
    timeout: 60_000,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-settle]")).toHaveAttribute("data-settle", "done", {
    timeout: 1_000,
  });
  const cam = await page.evaluate(() => {
    const m = (window as unknown as { __siterraStage?: { getPitch(): number; getZoom(): number } })
      .__siterraStage;
    return m ? { pitch: m.getPitch(), zoom: m.getZoom() } : null;
  });
  // ARRIVAL_POSE: pitch 54 (90 minus the 36 degree elevation); zoom well above the regional 9.4
  expect(cam?.pitch ?? 0).toBeCloseTo(54, 3);
  expect(cam?.zoom ?? 0).toBeGreaterThan(10.5);
});
