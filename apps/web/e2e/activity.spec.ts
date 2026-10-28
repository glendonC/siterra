import { expect, test } from "@playwright/test";
import { demoCase } from "./demo-case";

// The activity panel under the card, from the event log, on the synthetic replay route: labeled as a
// synthetic replay, played at a stated reading pace, one row per step with its model and tool badges; the
// card holds its outcome until the steps have played; a reload shows the whole log at once.

test("the panel plays a synthetic replay at reading pace, then the card gives the outcome", async ({
  page,
  baseURL,
}) => {
  const caseId = await demoCase(page.request, baseURL);
  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.locator("#command-input").press("Enter");

  const panel = page.locator("[data-activity]");
  const replay = panel.locator("[data-replay=synthetic]");
  await expect(replay).toContainText("Synthetic Replay · No Live Model");
  await expect(replay).toContainText("Reading pace: 1 event per 0.4 s.");
  const card = page.locator("[data-budget=card]");
  await expect(card).not.toContainText("Complete. Findings:");

  const rows = panel.locator("li[data-record-ids]");
  await expect(rows).toHaveCount(3, { timeout: 30_000 });
  await expect(panel).toContainText("Muse Spark · Synthetic Replay");
  await expect(panel).toContainText("Code: summarize_observations");
  await expect(panel).toContainText("returned 3 records");

  await expect(replay).not.toContainText("Reading pace", { timeout: 30_000 });
  await expect(card).toContainText("Complete. Findings:");
  await expect(rows.locator("text=Done")).toHaveCount(3);
  // the engine's five stages head the rows: the plan under Scope & Baseline, both analyses under Evidence
  await expect(panel.locator("[data-stage] h3")).toHaveText([
    "Scope & Baseline",
    "Evidence",
    "Hypothesis Testing",
    "Interventions & Precedents",
    "Field Verification",
  ]);
  await expect(panel.locator("[data-stage=scope_baseline] li[data-record-ids]")).toHaveCount(1);
  await expect(panel.locator("[data-stage=evidence] li[data-record-ids]")).toHaveCount(2);
  await expect(panel.locator("[data-empty=true]")).toHaveCount(3);

  // IU-02, TR-01, TR-04: numbered citation chips open source excerpt or measurement detail in one click
  const firstChip = card.locator("[data-citation-chip]").first();
  await expect(firstChip).toBeVisible();
  await firstChip.click();
  await expect(card.locator("[data-citation-detail]")).toBeVisible();
  await card.getByRole("button", { name: "Close" }).click();

  // CMP-16, TR-02, TR-05, TR-06: Trace toggle opens execution trace with model, tool, and validator counts
  await panel.locator("[data-trace-toggle]").click();
  const trace = panel.locator("[data-trace-drilldown]");
  await expect(trace).toContainText("Execution Trace");
  await expect(trace).toContainText("Models:");
  await expect(trace).toContainText("muse-spark-1.3 (replay, synthetic)");

  await page.reload();
  await expect(page.locator("[data-activity] li[data-record-ids]")).toHaveCount(3, {
    timeout: 60_000,
  });
  await expect(page.locator("[data-replay=synthetic]")).not.toContainText("Reading pace");
});
