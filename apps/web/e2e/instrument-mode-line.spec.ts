import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { atTheAnswer, readoutOn } from "./answer";

// Where a run comes from (DQ-02, as the founder decided on 2 Nov 2026): no mode line at the top right in any state and
// no "Live" anywhere. A replay says so in one line under its question, starting with "Replay"; a live run carries no
// label. Enter is pressed in the ask only against a stubbed stream (no worker, no model). The overview's home is the
// answer (UI-2); a question sent from it puts its steps on the screen at once.

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

const expectNoneShown = async (page: Page, where: string) => {
  await expect.poll(() => shownModeLines(page), { message: where, timeout: 15_000 }).toEqual([]);
};

test("when no run is active, no mode line is shown on the overview or instruments", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const rest = page.locator("[data-overview-root][data-ready]:not([data-arriving])");
  await atTheAnswer(page);
  await expect(rest).toHaveCount(1, { timeout: 90_000 });
  await expectNoneShown(page, "the answer");
  // a check of the plan lit on the land
  await readoutOn(page).locator("[data-readout-check] button").first().click();
  await expect(page.locator("[data-readout-place]")).toHaveCount(1);
  await expectNoneShown(page, "a check lit on the land");
  // every view by its address (Map Layers' address opens the answer, which splits its land in place)
  for (const id of ["layers", "cutaway", "rainfall", "pixel", "field"]) {
    await page.goto(`/instruments/${id}`);
    await expect(page.locator("[data-crumbs]").first()).toBeVisible({ timeout: 60_000 });
    await expectNoneShown(page, `/instruments/${id}`);
  }
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
  // the follow-up's completion is answered here too, so nothing reaches the server's model route
  await page.route("**/api/cases/*/commands/*/complete", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"skipped"}' }),
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
  await atTheAnswer(page);
  // no run, no mode line
  await expect(page.locator("[data-mode-line]")).toHaveCount(0);
  // every run word a mode line would show from here on (there should be none)
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { runWords: string[] }).runWords = seen;
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.target instanceof Element && r.target.hasAttribute("data-mode-line"))
          seen.push(r.target.getAttribute("data-run") ?? "-");
        for (const n of r.addedNodes)
          if (n instanceof Element) {
            const m = n.hasAttribute("data-mode-line") ? n : n.querySelector("[data-mode-line]");
            if (m) seen.push(m.getAttribute("data-run") ?? "-");
          }
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-run"],
    });
  });
  await page.keyboard.press("/");
  await page.keyboard.type("Why is the valley floor greener?");
  await page.keyboard.press("Enter");
  // the question's steps take the screen at once
  await expect(page.locator("[data-at-work]").first()).toBeVisible({ timeout: 20_000 });
}

test("a replayed run shows neither a replay line nor a mode line", async ({ page }) => {
  test.setTimeout(180_000);
  await stubbedRun(page, false);
  await expect(page.locator("[data-at-work] [data-run-replay]")).toHaveCount(0);
  await expect(page.locator("[data-overview-root][data-at-work='done']")).toHaveCount(1, {
    timeout: 60_000,
  });
  // from Enter until the run settled, no mode line appeared and nothing said Live
  const words = await page.evaluate(() => (window as unknown as { runWords: string[] }).runWords);
  expect(words).toEqual([]);
  expect(await shownModeLines(page)).toEqual([]);
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
});

test("a live run carries no label", async ({ page }) => {
  test.setTimeout(180_000);
  await stubbedRun(page, true);
  await expect(page.locator("[data-run-status]").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-run-replay]")).toHaveCount(0);
  expect(await shownModeLines(page)).toEqual([]);
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  const words = await page.evaluate(() => (window as unknown as { runWords: string[] }).runWords);
  expect(words).toEqual([]);
});
