import { expect, test, type Page, type Request } from "@playwright/test";

// The journey at "/" lands on the overview (approved specimen D4) as one world (decision 11): Enter on the opening,
// Enter on the globe, the camera goes down onto the case's point and the overview's own land rises there; no MapLibre
// valley is ever drawn. A returning visitor's reload goes straight to the overview, and the only write the page makes
// is the one demo session it opens on a first visit. Enter is never pressed in the ask here.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

/** Every request other than a GET. */
function writes(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() !== "GET") sent.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return sent;
}

async function overview(page: Page) {
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
  await expect(page.locator("[data-overview] [data-finding]")).toHaveCount(5);
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
  await other.click();
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await expect(page.locator("[data-case-card]")).toContainText(
    "Calaveras Creek catchment · Diablo Range, California",
  );
  await expect(page.locator("[data-case-card]")).toContainText(
    "Is grazing changing the rangeland of the Calaveras Creek catchment?",
  );
  // and the first place is offered from there in turn
  await expect(page.locator("[data-other-place='case_aitbouguemez']")).toBeVisible();
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
  await expect(page.locator("[data-ask]")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
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
  await overview(page);
  await expect(page.locator("[data-overview-root]")).not.toHaveAttribute("data-arriving", "");
  // no MapLibre valley is drawn at any point
  await expect(page.locator(".maplibregl-map")).toHaveCount(0);
  expect(sent).toEqual(["POST /api/demo-sessions"]);

  // a resumed visit: the stored demo copy, read again, with no new session
  sent.length = 0;
  await page.reload();
  await overview(page);
  await expect(page.locator("[data-phase]")).toHaveCount(0);
  expect(sent).toEqual([]);
});

test("Esc during the arrival ends it at once on the overview", async ({ page }) => {
  await page.goto("/?start");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=zoom]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 60_000 });
  await overview(page);
  await expect(page.locator("[data-case-card]")).toHaveCount(0);
});

test("under reduced motion Open cuts straight to the overview", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?start");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=globe]")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=zoom]")).toHaveCount(0);
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 60_000 });
  await overview(page);
});

test("no drawing gets a non-number through the journey, the overview, a card and the cut (U28f), at 800 x 600", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 800, height: 600 });
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
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase=rest]")).toBeVisible({ timeout: 90_000 });
  await overview(page);
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
  await page.locator("[data-finding='band']").click();
  await expect(page.locator("[data-record='band']")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await nonNumbers()).toEqual([]);
  await page.locator("[data-record] [data-actions] a").first().click();
  await expect(page.locator("[data-instrument='cutaway'] [data-band]").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  expect(await nonNumbers()).toEqual([]);
  expect(errors).toEqual([]);
});
