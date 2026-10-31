import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LIFE_BUNDLE, syntheticOccurrences } from "../lib/life/fixtures/occurrences";

// Recorded life on the land (UI-2). On the first place's own stored GBIF bundle: G shows the layer (off by default)
// with its counts, a point under the cursor opens its card, Enter reads its first record. On the SYNTHETIC fixture in
// the stored asset's format (it takes the real bundle's place in the case's snapshot, its asset served with the
// checksum the read API serves): every line of the cards, the fossil specimen counted and not drawn, Esc steps back,
// G hides the layer. Without a species bundle no key is offered.

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
    // the fixture takes the place of the case's own species bundle
    snap.records.dataBundleRecords = snap.records.dataBundleRecords.filter(
      (b) => b.methodId !== "species_occurrences",
    );
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

async function withoutLife(page: Page) {
  await page.route("**/api/cases/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    if (!res.ok()) return route.fulfill({ response: res });
    const snap = (await res.json()) as {
      records: { dataBundleRecords: Record<string, unknown>[] };
    };
    snap.records.dataBundleRecords = snap.records.dataBundleRecords.filter(
      (b) => b.methodId !== "species_occurrences",
    );
    return route.fulfill({ response: res, json: snap });
  });
}

test("G shows the first place's own recorded life; a point's card; Enter reads its first record", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  const layer = page.locator("[data-life-layer]");
  await expect(layer).toHaveCount(0);
  await page.mouse.move(720, 60);
  await page.keyboard.press("g");
  await expect(layer).toBeVisible({ timeout: 20_000 });
  // the stored bundle's kept records, the points they stand on and the years they span; no fossil specimen kept here
  const card = layer.locator("section").first();
  await expect(card).toContainText("632 records at 119 points, 1864 to 2025");
  await expect(card).not.toContainText("fossil");
  await expect(layer).toHaveAttribute("data-first-at", /\d/);
  const [x, y] = ((await layer.getAttribute("data-first-at")) ?? "0,0").split(",").map(Number);
  await page.mouse.move(x ?? 0, y ?? 0);
  const point = layer.locator("[data-life-point]");
  await expect(point).toBeVisible();
  await expect(point).toContainText("Recorded here");
  await expect(point).toContainText(/\d+ records?/);
  await page.keyboard.press("Enter");
  await expect(point).toContainText(/^1 of \d+/);
  // GBIF joins the data line while the layer shows
  await expect(page.locator("body")).toContainText("GBIF");
});

test("on the synthetic fixture: every card line; Enter steps the records, Esc steps back; G hides the layer", async ({
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
  await expect(page.getByRole("button", { name: /Species/ })).toBeVisible();
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
  await withoutLife(page);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await expect(page.getByRole("button", { name: /Species/ })).toHaveCount(0);
  await page.keyboard.press("g");
  await expect(page.locator("[data-life-layer]")).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
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
