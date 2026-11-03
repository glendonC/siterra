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
  await expect(work.locator("[data-agent-tree]")).toBeVisible();
  await expect(work.locator("[data-agent-cursor]")).not.toHaveCount(0);
  await expect(work.locator("[data-run-replay]")).toHaveCount(0);
  await expect(page.locator("[data-key-legend] [data-key='T']")).toHaveCount(0);
  await page.mouse.move(720, 450);
  await expect(page.locator("[data-hover-label][data-shown]")).toHaveCount(0);
  await page.keyboard.press("t");
  await expect(work).toBeVisible();
  const [q, treeBox] = await Promise.all([
    work.locator("[data-run-question]").boundingBox(),
    work.locator("[data-agent-tree]").boundingBox(),
  ]);
  expect(q && treeBox && Math.abs(treeBox.x - q.x) <= 2 && treeBox.y >= q.y + q.height - 1).toBe(
    true,
  );
  await expect(work.locator("[data-agent-state='queued']")).toHaveCount(0);
  await expect(work.locator("[data-run-step-count]")).toHaveText("Step 5 of 7");
  expect(await work.innerText()).not.toMatch(/[▸▾✓]/);
  await expect(page.locator("[data-mode-line]")).toHaveCount(0);
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
  await expect(work.locator("[data-run-branches]")).toHaveCount(0);
  const n = await words(page);
  expect(n).toBeGreaterThan(10);
  expect(n).toBeLessThanOrEqual(40);
  // Single-open accordion: only one thinking section is expanded and bold at a time
  await expect(work.locator("[data-agent-node][data-expanded]")).toHaveCount(1);
  await expect(work.locator("[data-agent-node][data-active-node]")).toHaveCount(1);
  // Following one agent opens its Steps card with searched chips and active step
  await page.keyboard.press(" ");
  await expect(work.locator("[data-agent-thinking]")).toBeVisible();
  await expect(work.locator("[data-thinking-chip]").first()).toContainText("Herrera 2024");
  await expect(work.locator("[data-thinking-chip]").first()).toHaveAttribute(
    "href",
    /digitallibrary\.un\.org/,
  );
  await expect(work.locator("[data-thinking-step]").first()).toContainText("Reading Herrera 2024");
  await expect(work.locator("[data-thinking-step]").first()).toHaveAttribute(
    "href",
    /digitallibrary\.un\.org/,
  );
  await expect(work.locator("[data-run-task][data-dimmed]")).not.toHaveCount(0);
  // Clicking the open section collapses it cleanly; clicking another section opens only that section
  await work.locator("[data-agent-node][data-expanded] > button").click();
  await expect(work.locator("[data-agent-node][data-expanded]")).toHaveCount(0);
  await expect(work.locator("[data-agent-thinking]")).toHaveCount(0);
  await work.locator("[data-agent-node='source_research'] > button").click();
  await expect(work.locator("[data-agent-node][data-expanded]")).toHaveCount(1);
  await expect(work.locator("[data-agent-thinking]")).toHaveCount(1);
  await expect(work.locator("[data-thinking-chip]").first()).toHaveAttribute(
    "href",
    "https://doi.org/10.1002/pan3.70379",
  );
  // All source chips render in a horizontally scrollable strip with edge fade
  expect(await work.locator("[data-thinking-chip]").count()).toBeGreaterThan(2);
  const chipStrip = work.locator("[data-agent-thinking] [data-thinking-chips]");
  await expect(chipStrip).toHaveAttribute("data-fade", "right");
  await chipStrip.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(chipStrip).toHaveAttribute("data-fade", "left");
  // Clicking 'Pause' pauses the trace and switches to 'Resume'; clicking 'Stop' stops the trace
  await expect(work.locator("[data-run-pause]")).toHaveText("Pause");
  await work.locator("[data-run-pause]").click();
  await expect(work.locator("[data-run-pause]")).toHaveText("Resume");
  await work.locator("[data-run-pause]").click();
  await expect(work.locator("[data-run-pause]")).toHaveText("Pause");
  await expect(work.locator("[data-run-stop]")).toHaveText("Stop");
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
  await expect(work.locator("[data-run-check]")).toContainText("Local Rain Records");
  await expect(work.locator("[data-run-card]")).toHaveCount(0);
  await expect(work.locator("[data-agent-review] [data-needs-you]")).toHaveText("Needs You");
  await expect(work.locator("[data-agent-review] button")).toContainText("Review field plan");
  const n = await words(page);
  expect(n).toBeGreaterThan(20);
  expect(n).toBeLessThanOrEqual(45);
  await expect(work.locator("[data-run-branches] li")).toHaveText([
    "RainfallSupported",
    "GrazingNeeds field data",
    "Land useRuled out",
    "Data artefactRuled out",
    "Snow or terrainRuled out",
  ]);
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
  await expect(work.locator("[data-run-replay]")).toHaveCount(0);
});

test("the thinking is the case's own run: the recording's question and measured length, and none for another place", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await page.keyboard.press("t");
  const work = page.locator("[data-at-work]").first();
  await expect(work).toBeVisible({ timeout: 20_000 });
  await expect(work.locator("[data-run-question]")).toHaveText(/Why is the valley floor greener\?/);
  await expect(work.locator("[data-run-status]")).toHaveText("23 findings in 101.1 s");
  await expect(work.locator("[data-run-replay]")).toHaveCount(0);
  await work.locator("[data-agent-review] button").click();
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(page.locator("[data-record='results']")).toBeVisible();

  await page.goto("/valley?case=case_calaveras_creek");
  await expect(page.locator("[data-overview-root][data-ready]")).toBeAttached({ timeout: 90_000 });
  await expect(page.locator("[data-key-legend] [data-key='T']")).toHaveCount(0);
  await page.keyboard.press("t");
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(page.locator("[data-run-status]")).toHaveCount(0);
});

test("on an open card T is the card's own key: it opens Over Time and never switches the thinking on", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/valley");
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await page.locator("[data-finding='band']").click();
  await expect(page.locator("[data-record='band']")).toBeVisible();
  await page.keyboard.press("t");
  await expect(page.locator("[data-crumbs]")).toContainText("Over Time", { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-crumbs]")).not.toContainText("Over Time", { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(page.locator("[data-overview-root][data-at-work]")).toHaveCount(0);
});
