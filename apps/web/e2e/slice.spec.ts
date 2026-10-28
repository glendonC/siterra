import { expect, test } from "@playwright/test";
import { checkBudget } from "../lib/budget/measure";
import { collectBudget } from "./budget";

// The B2 slice in the interface, concept mode, on the replay path: the worker runs with AGENT's synthetic
// replay (SITERRA_MODEL_ROUTE=replay, SITERRA_REPLAY_FILE=apps/worker/fixtures/
// seed-commission.synthetic.replay.json; .local/worker.zsh). Commission from the arrival, the command's
// events stream in, the card shows the work and then the committed Observations with one leader, and a
// reload replays the event log back to the same state (RL-04). Each run works on its own demo copy.
test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("commission, stream, Observations and reload", async ({ page, baseURL }) => {
  const start = await page.request.post("/api/demo-sessions", {
    headers: { origin: baseURL ?? "" },
  });
  expect(start.status(), await start.text()).toBe(201);
  const { caseId } = (await start.json()) as { caseId: string };

  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Concept Prototype")).toBeVisible();

  await page.keyboard.press("Enter");
  const card = page.locator("[data-budget=card]");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText(
    "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
  );
  // the worker plans and runs the steps from the replay, then the request completes
  await expect(card).toContainText("Complete. Findings:", { timeout: 60_000 });
  await expect(card).toContainText("Observations");
  await expect(card).toContainText(
    "Catchment rainfall, CHIRPS v3.0 monthly: 84 of 84 months observed, Jan 2019 to Dec 2025",
  );
  // one leader, ending on the catchment line with a tick, drawn once the card has settled
  await expect(page.locator("[data-budget=leader] path").first()).toHaveAttribute(
    "d",
    /^M[\d.]+ [\d.]+ L/,
  );
  await expect(page.locator("[data-budget=leader] path")).toHaveCount(2);
  await page.waitForTimeout(1500);
  // VC-04 and VC-05 for the working state: one card within 45 words, one leader, one action
  const report = checkBudget(await collectBudget(page), { width: 1440, height: 810 }, "working");
  test.info().annotations.push({ type: "budget", description: JSON.stringify(report) });
  expect(report.violations).toEqual([]);
  expect(report.counts.leaders).toBe(1);
  // the hint rule: once the request completes, ↵ has nothing to do, so its hint is gone
  await expect(page.getByRole("button", { name: "Run Assessment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  // TR-05: a model name never shows without its route and origin
  const text = await page.locator("body").innerText();
  for (const m of text.matchAll(/muse-spark[^\n]*/g)) expect(m[0]).toContain("(replay, synthetic)");
  const before = await card.innerText();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.SLICE_OUT) await page.screenshot({ path: process.env.SLICE_OUT });

  await page.reload();
  await expect(page.locator("[data-budget=card]")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator("[data-budget=card]").innerText()).toBe(before);
});
