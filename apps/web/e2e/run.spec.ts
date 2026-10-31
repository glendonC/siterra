import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// A question at work on the overview (U29, specimen R). The development harness plays the RECORDED run "Founder
// instance smoke 1" through the live event model and says it is a recording; a question sent from the ask takes the
// arc from its own event stream (here UI-1's synthetic replay of a run, served on the stream; no worker, no model).

test.use({ viewport: { width: 1440, height: 900 } });

/** Words on screen in the run's layer, outside the chrome and the action prompts, as decision 16 counts them. */
async function words(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector("[data-run-layer]");
    if (!root) return 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      if (!el || el.closest("[data-chrome], [data-action-prompt]")) continue;
      n += (t.textContent?.trim().match(/\S+/g) ?? []).length;
    }
    return n;
  });
}

test("the recorded run at work: one running task's card, its findings so far, and a recording that says so", async ({
  page,
}) => {
  test.skip(
    process.env.SITERRA_WEB_SERVER === "production",
    "the harness page is development only",
  );
  test.setTimeout(180_000);
  await page.goto("/run/preview?at=60000");
  const work = page.locator("[data-at-work]").first();
  await expect(work).toBeVisible({ timeout: 90_000 });
  await expect(work.locator("[data-run-question]")).toContainText(
    "Why is the valley floor greener?",
  );
  await expect(work.locator("[data-run-status]")).toHaveText("Findings so far: 17");
  await expect(work.locator("[data-run-card]")).toHaveCount(1);
  await expect(work.locator("[data-run-card]")).toContainText("Livelihoods & Governance");
  await expect(work.locator("[data-run-replay]")).toContainText("Recorded run, 30 Oct 2026");
  await expect(work.locator("[data-run-branches]")).toHaveCount(0);
  const n = await words(page);
  expect(n).toBeGreaterThan(10);
  expect(n).toBeLessThanOrEqual(40);
});

test("the recorded run settled: its count and time, the open explanations first, the proposed check; Enter reads the findings", async ({
  page,
}) => {
  test.skip(
    process.env.SITERRA_WEB_SERVER === "production",
    "the harness page is development only",
  );
  test.setTimeout(180_000);
  await page.goto("/run/preview?at=101121");
  const work = page.locator("[data-at-work]").first();
  await expect(work).toBeVisible({ timeout: 90_000 });
  await expect(work.locator("[data-run-status]")).toHaveText("23 findings in 101.1 s");
  await expect(work.locator("[data-run-findings]")).toContainText(
    "●7 checked◆7 computed○9 not yet checked",
  );
  await expect(work.locator("[data-run-branches] li")).toHaveText([
    "RainfallConsistent",
    "GrazingCannot be assessed",
    "Land useContradicted",
    "Data artefactContradicted",
    "Snow or terrainContradicted",
  ]);
  await expect(work.locator("[data-run-check]")).toContainText("Local Rain Records");
  await expect(work.locator("[data-run-card]")).toHaveCount(0);
  const n = await words(page);
  expect(n).toBeGreaterThan(20);
  expect(n).toBeLessThanOrEqual(45);
  // a reason only on hover
  await work.locator("[data-run-branches] li").first().hover();
  await expect(work.locator("[data-run-branches] li").first()).toContainText(/\S+ \S+/);
  await page.mouse.move(720, 40);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
});

test("a question sent from the ask takes the arc from its own stream, and a replay says what it is", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const raw = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "lib", "run", "fixtures", "replay-run.json"),
      "utf8",
    ),
  ) as { commandId: string; events: { sequence: number }[] };
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
  await page.keyboard.press("/");
  await page.keyboard.type("Why is the valley floor greener?");
  await page.keyboard.press("Enter");
  const work = page.locator("[data-at-work]").first();
  await expect(work).toBeVisible({ timeout: 20_000 });
  await expect(work.locator("[data-run-question]")).toContainText(
    "Why is the valley floor greener?",
  );
  await expect(work.locator("[data-run-replay]")).toContainText(
    "Replayed run, no model called now",
  );
});
