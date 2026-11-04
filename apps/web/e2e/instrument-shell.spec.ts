import { expect, test, type Locator, type Request } from "@playwright/test";
import { en } from "../lib/copy/en";
import { VIEW_LABEL } from "../lib/overview/actions";
import { crumbsOf, keyOf, loadedRecord } from "./answer";
import { textReport } from "./instrument-text";

// The chrome around each view (the lead's decisions 13 and 14, UI-2): no list of views and no word "Instrument" on
// screen; the breadcrumb names the view under its place; there is no ask circle: the ask opens by "/" or the key bar's
// "/ Ask" with the overview's suggestions for the place, and closes on Esc, its own "Esc Close" or a press outside. On a
// view the picture stays in sight under it and only the view's words step aside. Nothing is sent: Enter (which carries
// the text to the overview) and the ask's own Submit are never pressed here.

test.use({ viewport: { width: 1440, height: 900 } });

const PAGES = ["cutaway", "pixel", "rainfall", "field"] as const;
/** An element each view shows once its words are placed. */
const READY: Record<(typeof PAGES)[number], string> = {
  cutaway: "[data-band]",
  pixel: "[data-pixel-hero]",
  rainfall: "[data-season]",
  // the seed case holds no field plan: the page says so
  field: "[data-field-plan]",
};

for (const id of PAGES) {
  test(`frames the ${id} view with no view list, no ask circle and its name in the trail`, async ({
    page,
  }) => {
    await page.goto(`/instruments/${id}`);
    await expect(page.locator(READY[id]).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("nav[aria-label='Instruments']")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/\binstruments?\b/i);
    await expect(page.locator("[data-ask]")).toHaveCount(0);
    expect(await crumbsOf(page)).toEqual([
      "Aït Bouguemez valley",
      en["overview.crumb.results"].text,
      en[VIEW_LABEL[id]].text,
    ]);
    expect(await textReport(page, "[data-shell]")).toEqual({
      overlaps: [],
      small: [],
      outside: [],
    });
  });
}

/** How many of the given elements a visitor can see (not hidden by style). */
const seen = (els: Locator) =>
  els.evaluateAll((all) => all.filter((e) => getComputedStyle(e).visibility !== "hidden").length);

test("on a view the ask opens by the slash key and by the key bar, keeps the picture in sight with the words aside, closes three ways, and sends nothing", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    // opening the demo copy of the seed case is the one write a page makes before anything is asked
    if (r.method() !== "GET" && new URL(r.url()).pathname !== "/api/demo-sessions")
      sent.push(`${r.method()} ${r.url()}`);
  });
  const record = loadedRecord(page);
  await page.goto("/instruments/rainfall");
  const view = page.locator("[data-instrument='rainfall']");
  const picture = view.locator("[data-season]");
  await expect(picture.first()).toBeVisible({ timeout: 60_000 });
  await expect(keyOf(page, "S")).toBeVisible({ timeout: 30_000 });
  const { snapshot, listing } = await record;
  const ask = page.locator("[data-ask-overlay]");
  const input = page.locator("input[name='question']");
  const words = view.locator("[data-ask-aside]");
  const all = await words.count();
  expect(all).toBeGreaterThan(0);
  // "/" opens it on the line, with the place's suggestions less the case's own question (two at most)
  await page.keyboard.press("/");
  await expect(ask).toHaveAttribute("data-open", "");
  await expect(input).toBeFocused();
  const offered = (listing.suggestedQuestions ?? [])
    .filter((q) => q.question.trim().toLowerCase() !== snapshot.case.objective.trim().toLowerCase())
    .slice(0, 2)
    .map((q) => q.question);
  await expect(page.locator("[data-ask-suggestion]")).toHaveText(offered);
  // the picture stays in sight; the view's words step aside, and the key bar gives way to the ask's own keys
  await expect(picture.first()).toBeVisible();
  await expect.poll(() => seen(words)).toBe(0);
  await expect(page.locator("[data-key-legend]")).toBeHidden();
  await input.pressSequentially("Is the valley floor greener since 2019?");
  await expect(input).toHaveValue("Is the valley floor greener since 2019?");
  // Esc closes it and the words come back
  await page.keyboard.press("Escape");
  await expect(ask).not.toHaveAttribute("data-open", "");
  await expect.poll(() => seen(words)).toBe(all);
  await expect(page.locator("[data-key-legend]")).toBeVisible();
  // the key bar's "/ Ask" opens it; its own "Esc Close" closes it
  await keyOf(page, "/").click();
  await expect(ask).toHaveAttribute("data-open", "");
  await page.locator("[data-ask-keys] [data-ask-key='Escape']").click();
  await expect(ask).not.toHaveAttribute("data-open", "");
  // a press outside it closes it too
  await page.keyboard.press("/");
  await expect(ask).toHaveAttribute("data-open", "");
  await page.mouse.click(20, 450);
  await expect(ask).not.toHaveAttribute("data-open", "");
  // still on the view: neither close went back a level
  await expect(page).toHaveURL(/\/instruments\/rainfall$/);
  expect(sent).toEqual([]);
});
