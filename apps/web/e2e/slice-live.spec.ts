import { expect, test, type APIRequestContext } from "@playwright/test";
import type { CaseSnapshot, TraceResponse, UsageResponse } from "@siterra/contracts";
import { checkBudget } from "../lib/budget/measure";
import { collectBudget } from "./budget";

// GATE-03, narrowed by the founder on 28 Oct 2026 (docs/project/delivery-plan.md#gates): the B2 slice
// with the worker on the live Model API route. Commission from the arrival, the live plan's steps
// stream in, the card shows the Observations with one leader onto the catchment (the narrowed map
// layer: no data layer on the map yet), and a reload comes back to the same state without new model
// calls (RL-04). The run is live only if the case is live and every model call the command made is a
// Model API call with a provider request ID and usage. It spends real credits, so it runs only with
// SITERRA_SLICE_LIVE=1 against a web server and worker started for a live run; it never reads the key.
const LIVE = process.env.SITERRA_SLICE_LIVE === "1";
const SPEND_CAP_MICRO_USD = 500_000;

async function readJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(path);
  expect(res.status(), `${path}: ${await res.text()}`).toBe(200);
  return (await res.json()) as T;
}

test.skip(!LIVE, "live run only: set SITERRA_SLICE_LIVE=1 with a live web server and worker");
test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("live: commission, stream, Observations and reload on the Model API route", async ({
  page,
  baseURL,
}) => {
  // the command's wall clock is 180 s (P0_LIMITS); the arrival and the reload need time on top
  test.setTimeout(300_000);
  const start = await page.request.post("/api/demo-sessions", {
    headers: { origin: baseURL ?? "" },
  });
  expect(start.status(), await start.text()).toBe(201);
  const { caseId } = (await start.json()) as { caseId: string };

  await page.goto(`/stage?case=${caseId}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  // the case is live, so no live run is ever labelled a concept prototype
  const mode = page.getByRole("button", { name: "Live. What Siterra will and will not do" });
  await expect(mode).toHaveText("Live");
  await expect(page.getByText("Concept prototype")).toHaveCount(0);

  const commissionedAt = new Date().toISOString();
  await page.keyboard.press("Enter");
  const card = page.locator("[data-budget=card]");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText(
    "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
  );
  await expect(card).toContainText("Request complete", { timeout: 200_000 });
  await expect(card).toContainText("Observations");
  await expect(card).toContainText(
    "Catchment rainfall, CHIRPS v3.0 monthly: 84 of 84 months observed, Jan 2019 to Dec 2025",
  );
  // the narrowed map layer: one leader from the card onto the catchment line, with its tick
  await expect(page.locator("[data-budget=leader] path").first()).toHaveAttribute(
    "d",
    /^M[\d.]+ [\d.]+ L/,
  );
  await expect(page.locator("[data-budget=leader] path")).toHaveCount(2);
  await page.waitForTimeout(1500);
  const report = checkBudget(await collectBudget(page), { width: 1440, height: 810 }, "working");
  expect(report.violations).toEqual([]);
  expect(report.counts.leaders).toBe(1);
  // nothing on the page says replay or synthetic
  expect(await page.locator("body").innerText()).not.toMatch(/synthetic|\breplay\b/i);

  // what ran: the command's tasks, all terminal and succeeded, the plan among them
  const snapshot = await readJson<CaseSnapshot>(page.request, `/api/cases/${caseId}`);
  const tasks = snapshot.records.taskRecords;
  const commandIds = [...new Set(tasks.map((t) => t.commandId))];
  expect(commandIds).toHaveLength(1);
  const commandId = commandIds[0] ?? "";
  expect(tasks.map((t) => t.kind)).toContain("plan");
  // soft, so a run whose tasks fail still records its live evidence and its reload before failing
  expect
    .soft(tasks.filter((t) => t.status !== "succeeded").map((t) => [t.kind, t.status]))
    .toEqual([]);

  // live, not replayed: every model call of the command went to the Model API after the commission,
  // with a provider request ID and usage
  const trace = await readJson<TraceResponse>(
    page.request,
    `/api/cases/${caseId}/trace?commandId=${encodeURIComponent(commandId)}`,
  );
  const completed = trace.events.filter((e) => e.kind === "model.completed");
  expect(completed.length).toBeGreaterThan(0);
  for (const e of completed) {
    expect(e.usage?.provider).toBe("meta_model_api");
    expect(e.usage?.requestId ?? "").not.toBe("");
    expect(e.occurredAt > commissionedAt).toBe(true);
  }
  const usage = await readJson<UsageResponse>(page.request, `/api/cases/${caseId}/usage`);
  expect(usage.replay.calls).toBe(0);
  expect(usage.live.calls).toBe(completed.length);
  expect(usage.rows.every((r) => r.route === "live" && r.callsWithoutCost === 0)).toBe(true);
  expect(usage.live.estimatedCostMicroUsd).toBeLessThanOrEqual(SPEND_CAP_MICRO_USD);
  test.info().annotations.push({
    type: "live-run",
    description: JSON.stringify({
      caseId,
      commandId,
      tasks: tasks.map((t) => ({ kind: t.kind, status: t.status })),
      modelCalls: completed.length,
      requestIds: completed.map((e) => e.usage?.requestId),
      usage: usage.rows,
      estimatedCostMicroUsd: usage.live.estimatedCostMicroUsd,
    }),
  });

  // RL-04: a reload restores the same card and runs nothing again
  const before = await card.innerText();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.SLICE_OUT) await page.screenshot({ path: process.env.SLICE_OUT });
  await page.reload();
  await expect(page.locator("[data-budget=card]")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator("[data-budget=card]").innerText()).toBe(before);
  await expect(mode).toHaveText("Live");
  await page.waitForTimeout(3000);
  const after = await readJson<UsageResponse>(page.request, `/api/cases/${caseId}/usage`);
  expect(after.live.calls).toBe(usage.live.calls);
  const again = await readJson<CaseSnapshot>(page.request, `/api/cases/${caseId}`);
  expect(again.records.taskRecords.map((t) => [t.id, t.status])).toEqual(
    tasks.map((t) => [t.id, t.status]),
  );
});
