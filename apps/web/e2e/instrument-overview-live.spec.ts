import { expect, test, type Request } from "@playwright/test";

// The ask end to end on the overview (/valley): Enter sends one commission, the activity line names the task and
// the model from the session's event log, when the request commits the ring shows the findings of the new case
// revision without a reload, and the completed request's "Findings: N" opens its results (U11b), Esc back. This spec presses Enter, so it runs only against a replay worker on a lane's own
// database (SITERRA_E2E_REPLAY=1; the worker on SITERRA_MODEL_ROUTE=replay with
// apps/worker/fixtures/seed-commission.synthetic.replay.json, no key). Without that it is skipped.

test.use({ viewport: { width: 1440, height: 900 } });

const LIVE = process.env.SITERRA_E2E_REPLAY === "1";

/** The seed case's numbers on the ring; the synthetic replay commits observations and no new Measurement. */
const NUMBERS: [string, string][] = [
  ["catchment", "+0.0091"],
  ["band", "+0.0134"],
  ["pixel", "+0.0570"],
  ["rain", "0.037"],
  ["fdr", "24.7%"],
];
/** The task kinds the replay plans (the plan and two observation tasks), as the catalog names them. */
const TASKS = /Plan|Observation Analysis/;

test("Enter sends one request, names the task and model, and the ring follows the commit", async ({
  page,
}) => {
  test.skip(!LIVE, "presses Enter: runs only against a replay worker (SITERRA_E2E_REPLAY=1)");
  test.setTimeout(240_000);
  const commands: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && /\/api\/cases\/[^/]+\/commands$/.test(new URL(r.url()).pathname))
      commands.push(r.url());
  });
  await page.goto("/valley");
  const root = page.locator("[data-overview-root]");
  await expect(root).toHaveAttribute("data-ready", "", { timeout: 60_000 });
  const before = Number(await root.getAttribute("data-case-revision"));
  // a marker that a reload would lose, and every line the activity line shows
  await page.evaluate(() => {
    const w = window as unknown as { __noReload: boolean; __askLines: string[] };
    w.__noReload = true;
    w.__askLines = [];
    new MutationObserver(() => {
      const t = document.querySelector("[data-ask-activity]")?.textContent ?? "";
      if (t && w.__askLines.at(-1) !== t) w.__askLines.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  await page.locator("[data-ask]").click();
  const input = page.locator("input[name='question']");
  await expect(input).toBeFocused();
  await input.pressSequentially("What did catchment NDVI show in spring 2022?");
  await input.press("Enter");

  await expect.poll(() => commands.length, { timeout: 30_000 }).toBe(1);
  const lines = () =>
    page.evaluate(() => (window as unknown as { __askLines: string[] }).__askLines);
  await expect
    .poll(async () => (await lines()).some((l) => l.includes("Muse Spark") && TASKS.test(l)), {
      timeout: 120_000,
    })
    .toBe(true);

  // the commit advances the case revision; the ring is re-derived from it in place
  await expect
    .poll(async () => Number(await root.getAttribute("data-case-revision")), { timeout: 180_000 })
    .toBeGreaterThan(before);
  await expect(page.locator("[data-finding]")).toHaveCount(5);
  for (const [id, n] of NUMBERS)
    await expect(page.locator(`[data-finding='${id}']`)).toContainText(n);
  expect(commands).toHaveLength(1);
  expect(
    await page.evaluate(() => ({
      marker: (window as unknown as { __noReload?: boolean }).__noReload === true,
      navigations: performance.getEntriesByType("navigation").length,
    })),
  ).toEqual({ marker: true, navigations: 1 });

  // the completed request's "Findings: N" opens the results in the opened record's place; Esc returns
  const findings = page.locator("[data-ask-findings]");
  await expect(findings).toBeVisible({ timeout: 120_000 });
  const n = Number(/(\d+)/.exec((await findings.textContent()) ?? "")?.[1] ?? Number.NaN);
  expect(n).toBeGreaterThan(0);
  await findings.click();
  const results = page.locator("[data-record='results']");
  await expect(results).toBeVisible();
  await expect(results.locator("[data-results-caption]")).not.toBeEmpty();
  await expect(results.locator("[data-result]")).toHaveCount(n);
  await expect
    .poll(() => results.evaluate((el) => Number((el as HTMLElement).style.opacity)))
    .toBe(1);
  await page.keyboard.press("Escape");
  await expect(results).toHaveCount(0);
  expect(commands).toHaveLength(1);
});
