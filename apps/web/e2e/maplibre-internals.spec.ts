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
