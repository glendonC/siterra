import { expect, test } from "@playwright/test";

// The opening (the lead's decisions 7 and 10): what Siterra does, in general and large, one action into the globe
// ("Choose a Place"), how it works behind a quiet button; no place, no case, no internal names and no hidden map labels
// in the page. Then the globe (decisions 8 and 10): each case on its point with a card beside it, its place and region
// and its question from the record, and "Open"; the mouse hint in words.
test.use({ storageState: { cookies: [], origins: [] } });

test("the opening says what Siterra does and offers one action, how it works on request", async ({
  page,
}) => {
  await page.goto("/");
  const opening = page.locator("[data-opening]");
  await expect(opening).toBeVisible({ timeout: 60_000 });
  await expect(opening.locator("[data-string-id='opening.beat.1']")).toContainText(
    "Over half of Earth's land is open pasture and rangeland, supporting the livelihoods of about two billion people.",
  );
  await expect(opening.locator("[data-opening-action]")).toContainText("Press Enter to start");
  const dialog = opening.getByRole("dialog");
  await expect(dialog).toHaveCount(0);
  await opening.getByRole("button", { name: "Architecture" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Muse Spark");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // nothing else: no place, no internal names, no skip link, no hidden labels of the land behind
  const text = await opening.innerText();
  for (const gone of [
    "Bouguemez",
    "Region Pack",
    "Five Stages",
    "Skip to Map",
    "417.0",
    "Aït Ouchi",
    "Vertical Exaggeration",
  ])
    expect(text).not.toContain(gone);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.OPENING_OUT) await page.screenshot({ path: process.env.OPENING_OUT });
});

test("Enter on the opening goes on to the globe, where the case waits on its point with its card", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  const card = page.locator("[data-case-card]");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Aït Bouguemez valley · .+/);
  // step 1, the place: the card shows the place only, no question yet (UI-2)
  await expect(page.getByRole("region", { name: "Step 1 of 2: Location" })).toBeVisible();
  await expect(card.locator("[data-card-question]")).toHaveCount(0);
  await expect(page.getByText("Rotate Earth")).toBeVisible();
  // step 2, the question: the card carries the question chosen there
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Step 2 of 2: Investigation Question" }),
  ).toBeVisible();
  // the checked option's first span is its question
  const chosen = (
    await page.getByRole("radio", { checked: true }).locator("span").first().innerText()
  ).trim();
  expect(chosen.length).toBeGreaterThan(0);
  await expect(card.locator("[data-card-question]")).toHaveText(chosen);
});
