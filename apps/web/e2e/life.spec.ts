import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LIFE_BUNDLE, syntheticOccurrences } from "../lib/life/fixtures/occurrences";

// Recorded life on the land (UI-2), against the SYNTHETIC fixture in the stored asset's format until the real species
// bundles reach this branch: the case's snapshot is given one validated species_occurrences bundle and its asset is
// served with the checksum the read API serves. G shows the layer (off by default), its card counts what is drawn and
// what is not, the point under the cursor shows its stem, glyph and card, Enter steps through its records, Esc steps
// back, and G hides the layer again.

test.use({ viewport: { width: 1440, height: 900 } });

async function withSyntheticLife(page: Page) {
  const body = JSON.stringify(syntheticOccurrences);
  const etag = `"1220${createHash("sha256").update(body).digest("hex")}"`;
  await page.route(`**/api/cases/*/bundles/${SYNTHETIC_LIFE_BUNDLE}/assets/occurrences`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { etag }, body }),
  );
  await page.route("**/api/cases/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    if (!res.ok()) return route.fulfill({ response: res });
    const snap = (await res.json()) as {
      records: { dataBundleRecords: Record<string, unknown>[] };
    };
    const base = snap.records.dataBundleRecords.find((b) => b.status === "validated");
    if (base)
      snap.records.dataBundleRecords.push({
        ...base,
        id: SYNTHETIC_LIFE_BUNDLE,
        label: "SYNTHETIC species occurrences fixture",
        datasetId: "gbif-occurrence-search",
        methodId: "species_occurrences",
        methodVersion: "1.0.0",
        license: null,
        attribution: "SYNTHETIC fixture, not GBIF data",
      });
    return route.fulfill({ response: res, json: snap });
  });
}

test("G shows recorded life on the land; a point's stem, glyph and card; Enter steps its records; G hides it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await withSyntheticLife(page);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  // off by default; the key legend offers it where the case holds a species bundle
  const layer = page.locator("[data-life-layer]");
  await expect(layer).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Recorded Life/ })).toBeVisible();
  await page.mouse.move(720, 60);
  await page.keyboard.press("g");
  await expect(layer).toBeVisible({ timeout: 10_000 });
  const card = layer.locator("section").first();
  await expect(card).toContainText("12 records at 6 points, 1936 to 2025");
  await expect(card).toContainText("Not drawn: 1 fossil specimen");
  await expect(card).toContainText("Recorded here, not presence or abundance.");
  // the first point (five records of four species, two groups) under the cursor
  await expect(layer).toHaveAttribute("data-first-at", /\d/);
  const [x, y] = ((await layer.getAttribute("data-first-at")) ?? "0,0").split(",").map(Number);
  await page.mouse.move(x ?? 0, y ?? 0);
  const point = layer.locator("[data-life-point]");
  await expect(point).toBeVisible();
  await expect(point).toContainText("Recorded here");
  await expect(point).toContainText("5 records, 4 species, 2012 to 2021");
  await expect(point).toContainText("Location within about 30 m");
  await expect(point).toContainText("From 2 datasets, CC BY 4.0 and CC0 1.0");
  // Enter reads its records one by one, each with its basis, date, dataset and licence
  await page.keyboard.press("Enter");
  await expect(point).toContainText("1 of 5");
  await expect(point).toContainText("Alectoris barbara");
  await expect(point).toContainText("Human observation, 2012-04-04");
  await expect(point).toContainText("Location uncertainty not stated");
  await page.keyboard.press("Enter");
  await expect(point).toContainText("2 of 5");
  // Esc steps back to the point's card, without leaving the overview
  await page.keyboard.press("Escape");
  await expect(point).toContainText("5 records, 4 species");
  await expect(page).toHaveURL(/\/valley/);
  // the words never claim presence, abundance or change
  const words = (await layer.innerText()).replace("not presence or abundance", "");
  expect(words).not.toMatch(/presence|abundance|decline|increase|trend|common|rare/i);
  // G hides it again
  await page.mouse.move(720, 60);
  await page.keyboard.press("g");
  await expect(layer).toHaveCount(0);
});

test("recorded life stays on over time, and a case without a species bundle offers no key", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await expect(page.getByRole("button", { name: /Recorded Life/ })).toHaveCount(0);
  await page.keyboard.press("g");
  await expect(page.locator("[data-life-layer]")).toHaveCount(0);

  await withSyntheticLife(page);
  await page.reload();
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await page.locator("[data-finding='catchment']").click();
  await page.mouse.move(720, 60);
  await page.keyboard.press("t");
  await expect(page.locator("[data-time-view]")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("g");
  await expect(page.locator("[data-life-layer]")).toBeVisible({ timeout: 10_000 });
});
