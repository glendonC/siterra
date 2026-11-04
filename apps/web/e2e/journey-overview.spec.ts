import { expect, test, type Page, type Request } from "@playwright/test";
import { openView, readoutOn, shownLabels } from "./answer";

// The journey at "/" lands on the overview (approved specimen D4) as one world (decision 11): Enter on the opening,
// Enter on the globe, the camera goes down onto the case's point and the overview's own land rises there, the case's
// recorded run at work on it (its Analysis Steps), which hands over to the answer once it is done (UI-2); no MapLibre
// valley is ever drawn. A returning visitor's reload goes straight to the overview's home, the answer, and the only
// write the page makes is the one demo session it opens on a first visit. Enter is never pressed in the ask here.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

/** Every request other than a GET. */
function writes(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() !== "GET") sent.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return sent;
}

/** The globe's two steps (UI-2): Enter takes the chosen place to step 2, the question; Enter again starts. */
async function chooseAndStart(page: Page) {
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Step 2 of 2: Investigation Question" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
}

/**
 * The overview, drawn: after the journey's arrival the case's recorded run is at work on it, its steps showing; on a
 * resumed visit it opens on its home, the answer. No finding label is left round the arc either way.
 */
async function overview(page: Page, on: "steps" | "answer") {
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  if (on === "steps")
    await expect(page.locator("[data-overview] [data-at-work][data-run-layer]")).toBeVisible({
      timeout: 15_000,
    });
  else await expect(readoutOn(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => shownLabels(page)).toBe(0);
  // the old arrival is gone: no command line, no cards, no settled MapLibre valley
  await expect(page.locator("#command-input")).toHaveCount(0);
  await expect(page.locator("[data-arrival-settled]")).toHaveCount(0);
}

test("the globe offers the other places the case listing holds, each opening its own journey (U25)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  const other = page.locator("[data-other-place='case_calaveras_creek']");
  await expect(other).toHaveText("Calaveras Creek catchment · Diablo Range, California");
  await expect(other).toHaveAttribute("href", "/?case=case_calaveras_creek&start");
  await other.evaluate((a: HTMLAnchorElement) => {
    a.click();
  });
  await expect(page.locator("[data-phase=globe]")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-case-card]")).toContainText(
    "Calaveras Creek catchment · Diablo Range, California",
  );
  // and the first place is offered from there in turn
  await expect(page.locator("[data-other-place='case_aitbouguemez']")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-case-card]")).toContainText(
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
  );
});

test("the opening, the globe and the zoom land on the overview, and a reload returns straight to it", async ({
  page,
}) => {
  const sent = writes(page);
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  // the overview waits under the globe, out of reach: no key on the globe reaches it
  await expect(page.locator("#arrival")).toHaveAttribute("inert", "");
  await page.keyboard.press("/");
  // (the overview's ask has no circle now: it is closed while its panel is not open)
  await expect(page.locator("[data-variant='arc'][data-open]")).toHaveCount(0);
  // "/" is the globe's own place search; leave it before choosing
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await chooseAndStart(page);
  await expect(page.locator("[data-phase=zoom]")).toBeVisible();
  // the case's card stays on screen as the camera goes down, without its action; on a fast or busy machine the zoom
  // may already have landed when this looks (AUDIT: a timing flake at two workers), so the card is checked while the
  // zoom lasts
  await expect
    .poll(async () =>
      (await page.locator("[data-phase=zoom]").count())
        ? await page.locator("[data-case-card]").isVisible()
        : true,
    )
    .toBe(true);
  await expect(page.locator("[data-case-card] button")).toHaveCount(0);
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 90_000 });
  await overview(page, "steps");
  await expect(page.locator("[data-overview-root]")).not.toHaveAttribute("data-arriving", "");
  // no MapLibre valley is drawn at any point
  await expect(page.locator(".maplibregl-map")).toHaveCount(0);
  expect(sent).toEqual(["POST /api/demo-sessions"]);

  // a resumed visit: the stored demo copy, read again, with no new session, on the overview's home
  sent.length = 0;
  await page.reload();
  await overview(page, "answer");
  await expect(page.locator("[data-phase]")).toHaveCount(0);
  expect(sent).toEqual([]);
});

test("Esc during the arrival ends it at once on the overview", async ({ page }) => {
  await page.goto("/?start");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await chooseAndStart(page);
  await expect(page.locator("[data-phase=zoom]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 60_000 });
  await overview(page, "steps");
  await expect(page.locator("[data-case-card]")).toHaveCount(0);
});

test("under reduced motion Open cuts straight to the overview", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?start");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await chooseAndStart(page);
  await expect(page.locator("[data-phase=zoom]")).toHaveCount(0);
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 60_000 });
  await overview(page, "steps");
});

test("no drawing gets a non-number through the journey, the overview, its answer and the cut (U28f), at 1024 x 600", async ({
  page,
}) => {
  test.setTimeout(240_000);
  // the smallest window the app draws: below 1024 x 600 the size gate shows instead, since phones are gated for the
  // hackathon (founder, 2 Nov)
  await page.setViewportSize({ width: 1024, height: 600 });
  // the browser reports an attribute that is not a number ('<path> attribute d: Expected number, "MNaN ...')
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Expected number|NaN/.test(m.text()))
      errors.push(m.text().slice(0, 120));
  });
  const nonNumbers = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("svg *")].flatMap((e) =>
        [...e.attributes]
          .filter((a) => /NaN|Infinity/.test(a.value))
          .map((a) => `${e.tagName} ${a.name}`),
      ),
    );
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await chooseAndStart(page);
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 90_000 });
  await overview(page, "steps");
  await page.waitForTimeout(1500);
  expect(await nonNumbers()).toEqual([]);
  // a hidden browser pane gives every element no size (the lead's walk): hide the page a moment, then show it again
  await page.evaluate(() => {
    document.documentElement.style.display = "none";
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.documentElement.style.display = "";
  });
  await page.waitForTimeout(800);
  expect(await nonNumbers()).toEqual([]);
  // the recorded run, once done, hands over to its answer by itself
  await expect(readoutOn(page)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1200);
  expect(await nonNumbers()).toEqual([]);
  await openView(page, "cutaway");
  await expect(page.locator("[data-instrument='cutaway'] [data-band]").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  expect(await nonNumbers()).toEqual([]);
  expect(errors).toEqual([]);
});

test("the globe credits the rangeland layer it draws: Resolve's ecoregions, CC BY 4.0 (U30)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByText("Ecoregions 2017 © Resolve, CC BY 4.0")).toBeVisible();
});
