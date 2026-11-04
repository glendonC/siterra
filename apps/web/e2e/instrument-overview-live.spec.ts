import { expect, test, type Request } from "@playwright/test";
import { en } from "../lib/copy/en";
import { rd } from "../lib/copy/readout";
import { atTheAnswer, readoutOn } from "./answer";

// The ask end to end on the overview (/valley), UI-2: Enter sends one commission and its steps take the screen at once
// with the question and the working word; when the request commits, the case revision advances without a reload and
// the steps hand over to the question's own answer (/valley?run=<id>), its Follow-up naming the question. This spec
// presses Enter for real, so it runs only against a replay worker on a lane's own database (SITERRA_E2E_REPLAY=1; the
// worker on SITERRA_MODEL_ROUTE=replay with apps/worker/fixtures/seed-commission.synthetic.replay.json, no key).
// Without that it is skipped; never run it against the shared dev server.

test.use({ viewport: { width: 1440, height: 900 } });

const LIVE = process.env.SITERRA_E2E_REPLAY === "1";
const QUESTION = "What did catchment NDVI show in spring 2022?";

test("Enter sends one request, its steps show at once, and once it commits they hand over to its own answer", async ({
  page,
}) => {
  test.skip(!LIVE, "presses Enter: runs only against a replay worker (SITERRA_E2E_REPLAY=1)");
  test.setTimeout(240_000);
  const commands: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && /\/api\/cases\/[^/]+\/commands$/.test(new URL(r.url()).pathname))
      commands.push(r.url());
  });
  await atTheAnswer(page);
  const root = page.locator("[data-overview-root]");
  const before = Number(await root.getAttribute("data-case-revision"));
  // a marker that a reload would lose
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  await page.keyboard.press("/");
  const input = page.locator("input[name='question']");
  await expect(input).toBeFocused();
  await input.pressSequentially(QUESTION);
  await input.press("Enter");
  await expect.poll(() => commands.length, { timeout: 30_000 }).toBe(1);

  // its steps at once: the question as typed and the working word
  const work = page.locator("[data-at-work][data-run-layer]");
  await expect(work).toBeVisible();
  await expect(work.locator("[data-run-question]")).toContainText(QUESTION);
  await expect(work.locator("[data-ask-status]")).toContainText(en["run.tree.working"].text);

  // the commit advances the case revision in place
  await expect
    .poll(async () => Number(await root.getAttribute("data-case-revision")), { timeout: 180_000 })
    .toBeGreaterThan(before);
  // and the steps hand over to the question's own answer, its Follow-up naming the question
  await expect(readoutOn(page)).toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/[?&]run=/);
  const followUp = readoutOn(page).locator("[data-readout-request]");
  await expect(followUp.locator("dt")).toHaveText(rd["readout.request.head"].text);
  await expect(followUp).toContainText(QUESTION);
  expect(commands).toHaveLength(1);
  expect(
    await page.evaluate(() => ({
      marker: (window as unknown as { __noReload?: boolean }).__noReload === true,
      navigations: performance.getEntriesByType("navigation").length,
    })),
  ).toEqual({ marker: true, navigations: 1 });
});
