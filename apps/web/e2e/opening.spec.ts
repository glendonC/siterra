import { expect, test } from "@playwright/test";

// The opening (the lead's decision 7): three things only, the case's own question large, one sentence of what
// Siterra does and one action into the globe; how it works waits behind a quiet button; no internal names and no
// hidden map labels in the page. Then the globe (decision 8): the place in the record's words, one action, and the
// mouse hint in words.
test.use({ storageState: { cookies: [], origins: [] } });

test("the opening shows the case's question, one sentence and one action, how it works on request", async ({
  page,
}) => {
  await page.goto("/");
  const opening = page.locator("[data-opening]");
  await expect(opening).toBeVisible({ timeout: 60_000 });
  const caseId = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("siterra.demoCase") ?? "{}") as { caseId?: string }).caseId,
  );
  const record = await page.request.get(`/api/cases/${caseId ?? ""}`);
  const objective = ((await record.json()) as { case: { objective: string } }).case.objective;
  await expect(opening.locator("h1")).toHaveText(objective);
  await expect(opening.getByRole("button")).toHaveText(["Explore the Valley↵", "How It Works"]);
  const how = opening.locator("[data-how]");
  await expect(how).toBeHidden();
  await opening.getByRole("button", { name: "How It Works" }).click();
  await expect(how).toBeVisible();
  await expect(how).toContainText("Muse Spark");
  // nothing else: no internal names, no skip link, no hidden labels of the land behind
  const text = await page.locator("body").innerText();
  for (const gone of [
    "Region Pack",
    "Five Stages",
    "Scope & Baseline",
    "Skip to Map",
    "417.0",
    "Aït Ouchi",
    "Vertical Exaggeration",
  ])
    expect(text).not.toContain(gone);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.OPENING_OUT) await page.screenshot({ path: process.env.OPENING_OUT });
});

test("Enter on the opening goes on to the globe, which names the place and says how to turn it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await expect(page.locator("[data-globe-place]")).toHaveText(/^Aït Bouguemez valley · .+/);
  await expect(page.getByRole("button", { name: /Go to the Valley/ })).toBeVisible();
  await expect(page.getByText("drag to turn")).toBeVisible();
  await expect(page.locator("kbd", { hasText: "Drag" })).toHaveCount(0);
});
