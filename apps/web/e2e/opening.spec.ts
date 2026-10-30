import { expect, test } from "@playwright/test";

// The opening: one screen that says what Siterra does, names the model, asks the case's own question, and
// offers the action into the globe and a skip link straight to the arrival, the overview.
test.use({ storageState: { cookies: [], origins: [] } });

test("one opening screen with the case's question, and the skip link goes straight to the map", async ({
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
  await expect(opening).toContainText(`Question${objective}`);
  await expect(opening).toContainText("Muse Spark");
  await expect(opening.locator("[data-stages] li")).toHaveText([
    "Scope & Baseline",
    "Evidence",
    "Hypothesis Testing",
    "Interventions & Precedents",
    "Field Verification",
  ]);
  await expect(opening.locator("[data-pack]")).toContainText("Real Data · Field Unverified");
  await expect(opening.locator("h1")).toHaveCount(1);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.OPENING_OUT) await page.screenshot({ path: process.env.OPENING_OUT });

  // a viewer moving by keyboard reaches the skip link from the action
  await page.getByRole("button", { name: /Open Region Pack/ }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to Map" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=arrival]")).toBeVisible();
  // the arrival is the overview (approved specimen D4) with the case's question and its five findings
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  await expect(page.locator("[data-overview]")).toContainText(objective);
  await expect(page.locator("[data-finding]")).toHaveCount(5);
});

test("Enter on the opening goes on to the globe", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
});
