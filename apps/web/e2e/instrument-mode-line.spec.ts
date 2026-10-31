import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The mode line (U32; PC-04 and DQ-02): every screen after the opening shows the case's mode from its record, one
// click on it on arrival lists what Siterra does not do, Esc or a click elsewhere closes it, and a run says where it
// comes from (Replay or Live) once its events say so. The demo cases are seeded in concept mode. Enter is pressed in
// the ask only against a stubbed stream (no worker, no model).

test.use({ viewport: { width: 1440, height: 900 } });

/** Mode lines a visitor can see: inside the screen and not faded out with the chrome round them. */
const shownModeLines = (page: Page) =>
  page.locator("[data-mode-line]").evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right > innerWidth || r.bottom > innerHeight) return false;
        for (let e: Element | null = el; e; e = e.parentElement)
          if (Number(getComputedStyle(e).opacity) < 0.5) return false;
        return true;
      })
      .map((el) => el.textContent.trim()),
  );

const expectOneShown = async (page: Page, where: string) => {
  await expect
    .poll(() => shownModeLines(page), { message: where, timeout: 15_000 })
    .toEqual(["What Siterra won't do"]);
};

test("on arrival, one click on the mode line lists what Siterra does not do; Esc closes it and stays", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // a first visit, so / plays the opening and the globe
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
  // the opening itself carries no mode line
  expect(await shownModeLines(page)).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-case-card]")).toBeVisible({ timeout: 30_000 });
  await expectOneShown(page, "the globe");
  await page.keyboard.press("Enter");
  const root = page.locator("[data-overview-root][data-ready]:not([data-arriving])");
  await expect(root).toHaveCount(1, { timeout: 60_000 });
  await expectOneShown(page, "the overview on arrival");
  // one interaction
  await page.locator("[data-mode-line] button").first().click();
  const scope = page.locator("[data-scope-popover]");
  await expect(scope).toBeVisible();
  for (const item of ["contact people", "spend money", "make land decisions"])
    await expect(scope).toContainText(item);
  await expect(scope).toContainText("Every result is a draft until a person reviews it.");
  await page.keyboard.press("Escape");
  await expect(scope).toHaveCount(0);
  // the Esc closed the popover only: the overview is still here
  await expect(root).toHaveCount(1);
  await expect(page.locator("[data-opening]")).toHaveCount(0);
  // a click elsewhere closes it too
  await page.locator("[data-mode-line] button").first().click();
  await expect(scope).toBeVisible();
  await page.mouse.click(720, 160);
  await expect(scope).toHaveCount(0);
  await context.close();
});

test("the mode line is on every view: overview, a card, layers, over time, the pixel, each instrument, the second place", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const rest = page.locator("[data-overview-root][data-ready]:not([data-arriving])");
  await page.goto("/valley");
  await expect(rest).toHaveCount(1, { timeout: 90_000 });
  await expectOneShown(page, "the overview");
  await page.locator("[data-finding='fdr']").click();
  await expect(page.locator("[data-record='fdr']")).toBeVisible();
  await expectOneShown(page, "a finding's card");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-sheet]").first()).toBeVisible({ timeout: 30_000 });
  await expectOneShown(page, "the layers in place");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sheet]")).toHaveCount(0, { timeout: 15_000 });
  await page.locator("[data-finding='fdr']").click();
  await page.mouse.move(720, 120);
  await page.keyboard.press("t");
  await expect(page.locator("[data-time-view]")).toBeVisible({ timeout: 15_000 });
  await expectOneShown(page, "see it over time");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-time-view]")).toHaveCount(0, { timeout: 15_000 });
  await page.locator("[data-finding='pixel']").click();
  await page.locator("[data-record] [data-actions] a").first().click();
  await expect(page.locator("[data-chip='03']")).toBeVisible({ timeout: 30_000 });
  await expectOneShown(page, "the pixel in place");
  for (const id of ["layers", "cutaway", "rainfall", "pixel", "field"]) {
    await page.goto(`/instruments/${id}`);
    await expect(page.locator("[data-crumbs]")).toBeVisible({ timeout: 60_000 });
    await expectOneShown(page, `/instruments/${id}`);
  }
  await page.goto("/valley?case=case_calaveras_creek");
  await expect(rest).toHaveCount(1, { timeout: 90_000 });
  await expectOneShown(page, "the second place");
  await page.mouse.move(720, 120);
  await page.keyboard.press("g");
  await expect(page.locator("[data-life-layer]")).toBeVisible({ timeout: 15_000 });
  await expectOneShown(page, "recorded life");
});

/** Sends a question against a stubbed command and event stream (no worker, no model); `live` rewrites the replay
 * fixture's usage as a live provider's. */
async function stubbedRun(page: Page, live: boolean) {
  const raw = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "lib", "run", "fixtures", "replay-run.json"),
      "utf8",
    ),
  ) as {
    commandId: string;
    events: { sequence: number; usage?: { provider: string; replayOrigin?: string } | null }[];
  };
  if (live)
    for (const e of raw.events)
      if (e.usage) {
        e.usage.provider = "meta";
        delete e.usage.replayOrigin;
      }
  await page.route("**/api/cases/*/commands", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ recordType: "Command", id: raw.commandId }),
        })
      : route.continue(),
  );
  await page.route("**/api/cases/*/events*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: raw.events
        .map((e) => `id: ${String(e.sequence)}\ndata: ${JSON.stringify(e)}\n\n`)
        .join(""),
    }),
  );
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  // no run, no run word
  await expect(page.locator("[data-mode-line]")).not.toHaveAttribute("data-run", /./);
  // every run word the mode line shows from here on, in order (AUDIT's sampler: never Live before Replay)
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { runWords: string[] }).runWords = seen;
    new MutationObserver((records) => {
      for (const r of records)
        if (r.target instanceof Element && r.target.hasAttribute("data-mode-line"))
          seen.push(r.target.getAttribute("data-run") ?? "-");
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-run"] });
  });
  await page.keyboard.press("/");
  await page.keyboard.type("Why is the valley floor greener?");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-at-work]").first()).toBeVisible({ timeout: 20_000 });
}

test("a replayed run says Replay on the mode line, clear of the run's own note", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await stubbedRun(page, false);
  const note = page.getByText("Replayed run, no model called now");
  await expect(note).toBeVisible({ timeout: 30_000 });
  const line = page.locator("[data-mode-line]");
  await expect(line).toHaveAttribute("data-run", "replay");
  // from Enter until the run settles, the line never said Live
  await expect(page.locator("[data-overview-root][data-at-work='done']")).toHaveCount(1, {
    timeout: 60_000,
  });
  const words = await page.evaluate(() => (window as unknown as { runWords: string[] }).runWords);
  expect(words).toContain("replay");
  expect(words).not.toContain("live");
  // the case's mode and the run's source are two elements, so their text runs together here
  await expect.poll(() => shownModeLines(page)).toEqual(["What Siterra won't doReplay"]);
  const a = await line.boundingBox();
  const b = await note.boundingBox();
  expect(a && b && (b.y >= a.y + a.height || b.x >= a.x + a.width || b.x + b.width <= a.x)).toBe(
    true,
  );
});

test("a live run says Live on the mode line", async ({ page }) => {
  test.setTimeout(180_000);
  await stubbedRun(page, true);
  await expect(page.locator("[data-run-status]").first()).toBeVisible({ timeout: 30_000 });
  const line = page.locator("[data-mode-line]");
  await expect(line).toHaveAttribute("data-run", "live", { timeout: 30_000 });
  await expect.poll(() => shownModeLines(page)).toEqual(["What Siterra won't doLive"]);
  await expect(page.getByText("Replayed run, no model called now")).toHaveCount(0);
});
