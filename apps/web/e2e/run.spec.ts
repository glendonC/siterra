import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ak } from "../lib/copy/ask";
import { en } from "../lib/copy/en";
import { rd } from "../lib/copy/readout";
import { failedLine, refusedLine } from "../lib/overview/ask-line";
import {
  answerOf,
  atTheAnswer,
  crumbsOf,
  keyOf,
  keysOf,
  loadedRecord,
  openView,
  readoutOn,
  recorded,
} from "./answer";

// A question at work on the overview (U29, specimen R). The development harness plays the RECORDED run "Founder
// instance smoke 1" through the live event model; a question sent from the ask takes the arc from its own event
// stream (here UI-1's synthetic replay of a run, served on the stream; no worker, no model) and its steps take the
// screen at once. The overview's home is the answer (UI-2); on a run's own answer (/valley?run=) T, Analysis Steps,
// swaps it with that run's steps.

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
  const work = page.locator("[data-at-work][data-run-layer]");
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

test("the recorded run settled: the verdicts first fitting, in the answer's words; its last row reads the findings with Enter", async ({
  page,
}) => {
  test.skip(
    process.env.SITERRA_WEB_SERVER === "production",
    "the harness page is development only",
  );
  test.setTimeout(180_000);
  await page.goto("/run/preview?at=101121");
  const work = page.locator("[data-at-work][data-run-layer]");
  await expect(work).toBeVisible({ timeout: 90_000 });
  await expect(work.locator("[data-run-card]")).toHaveCount(0);
  // the run's record asks the visitor for no review: its last row is the way to its findings, with Enter's key
  await expect(work.locator("[data-agent-review] [data-needs-you]")).toHaveCount(0);
  await expect(work.locator("[data-agent-review] button")).toHaveText(`${en["run.open"].text}↵`);
  const n = await words(page);
  expect(n).toBeGreaterThan(20);
  expect(n).toBeLessThanOrEqual(45);
  // each explanation with its verdict in the answer's three words, fitting first (lib/copy/readout.ts)
  const verdict = (s: "consistent" | "cannot_be_assessed" | "contradicted") =>
    rd[`readout.verdict.${s}`].text;
  await expect(work.locator("[data-run-branches] li")).toHaveText([
    `Rainfall${verdict("consistent")}`,
    `Grazing${verdict("cannot_be_assessed")}`,
    `Land use${verdict("contradicted")}`,
    `Data artefact${verdict("contradicted")}`,
    `Snow or terrain${verdict("contradicted")}`,
  ]);
  // no line under every step that only says the code checked it
  expect(await work.innerText()).not.toMatch(/Proposal checked by code/);
  await page.mouse.move(720, 40);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
});

const QUESTION = "Why is the valley floor greener?";
const PLACE = "Aït Bouguemez valley";

/** An event of a question's own, in the shape the server writes (lib/live-place/follow-up.ts). */
function eventOf(
  caseId: string,
  sequence: number,
  kind: string,
  commandId: string,
  taskId: string | null,
  extra: Record<string, unknown> = {},
) {
  return {
    recordType: "Event",
    schemaVersion: "1.19.0",
    id: `evt_e2e_ask_${String(sequence).padStart(4, "0")}`,
    caseId,
    sequence,
    occurredAt: new Date().toISOString(),
    kind,
    commandId,
    taskId,
    caseRevision: 1,
    entityIds: [taskId ?? commandId],
    message: kind,
    dedupeKey: `e2e.ask.${kind}.${String(sequence)}`,
    resultStatus: null,
    tool: null,
    usage: null,
    validation: null,
    spanId: null,
    parentSpanId: null,
    ...extra,
  };
}

/**
 * Answers every route a typed question takes, so nothing of it reaches the server: the command's acceptance (held a
 * moment, so the screen before any answer can be read) or its refusal, the completion call, a cancel, and the case's
 * event stream. `events` is the stream served once the command is accepted; `records` adds to the case record then.
 */
async function askStubs(
  page: Page,
  answer:
    | {
        accept: string;
        events: (caseId: string) => unknown[];
        tasks?: (caseId: string) => unknown[];
      }
    | { refuse: number; body: unknown },
) {
  let caseId = "";
  let accepted = false;
  await page.route(/\/api\/cases\/[^/]+\/commands$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    caseId =
      /\/api\/cases\/([^/]+)\/commands$/.exec(new URL(route.request().url()).pathname)?.[1] ?? "";
    await new Promise((r) => setTimeout(r, 1500));
    if ("refuse" in answer)
      return route.fulfill({
        status: answer.refuse,
        contentType: "application/problem+json",
        body: JSON.stringify(answer.body),
      });
    accepted = true;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ recordType: "Command", id: answer.accept, caseId }),
    });
  });
  await page.route("**/api/cases/*/commands/*/complete", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"skipped"}' }),
  );
  await page.route("**/api/commands/*/cancel", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  // the stream ends after each answer, so the page asks again: nothing until the command is accepted, then its events
  await page.route("**/api/cases/*/events*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        accepted && "accept" in answer
          ? answer
              .events(caseId)
              .map(
                (e) =>
                  `id: ${String((e as { sequence: number }).sequence)}\ndata: ${JSON.stringify(e)}\n\n`,
              )
              .join("")
          : "",
    }),
  );
  if ("accept" in answer && answer.tasks) {
    const tasks = answer.tasks;
    await page.route(/\/api\/cases\/[^/]+(\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET" || !accepted) return route.fallback();
      const res = await route.fetch();
      if (!res.ok()) return route.fulfill({ response: res });
      const body = (await res.json()) as { records: { taskRecords: unknown[] } };
      body.records.taskRecords.push(...tasks(caseId));
      return route.fulfill({ response: res, json: body });
    });
  }
}

/** Types the question in the Ask over the answer and sends it. */
async function ask(page: Page) {
  await page.keyboard.press("/");
  await expect(page.locator("input[name='question']")).toBeFocused();
  await page.keyboard.type(QUESTION);
  await page.keyboard.press("Enter");
}

/** The steps' status line: the state it carries, and its words. */
const statusOf = (page: Page) => page.locator("[data-at-work][data-run-layer] [data-ask-status]");

test("a question sent from the ask: its steps at once, Analyzing on a clock before any answer, its own stream, then its own answer", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const raw = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "lib", "run", "fixtures", "replay-run.json"),
      "utf8",
    ),
  ) as { commandId: string; events: { sequence: number }[] };
  // its own stream: its command, not the recording's (UI-1's synthetic replay of a run, served here)
  expect(raw.commandId).not.toBe(recorded.commandId);
  await askStubs(page, { accept: raw.commandId, events: () => raw.events });
  await atTheAnswer(page);
  await ask(page);
  // at once, before the server has answered: the steps under their own crumb, the question as typed, and the
  // working word on its clock
  const work = page.locator("[data-at-work][data-run-layer]");
  await expect(work).toBeVisible({ timeout: 1_000 });
  expect(await crumbsOf(page)).toEqual([PLACE, en["chrome.key.thinking"].text]);
  await expect(work.locator("[data-run-question]")).toContainText(QUESTION);
  await expect(statusOf(page)).toHaveAttribute("data-ask-status", "working");
  await expect(statusOf(page)).toContainText(en["run.tree.working"].text);
  await expect(statusOf(page)).toContainText(
    new RegExp(en["run.tree.time"].text.replace("{time}", "\\d+\\.\\d")),
  );
  await expect(work.locator("[data-run-replay]")).toHaveCount(0);
  // done, the steps hand over to its own answer, which the address names
  await expect(readoutOn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`[?&]run=${raw.commandId}`));
});

test("a refused question stays on its steps with one sentence, Ask Again keeps its words, and Esc goes back to the answer as it was", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // the visit's own question limit is used: the server refuses the command
  await askStubs(page, {
    refuse: 429,
    body: { code: "quota_exhausted", detail: "This visit's questions are used." },
  });
  await atTheAnswer(page);
  await ask(page);
  const work = page.locator("[data-at-work][data-run-layer]");
  await expect(work).toBeVisible({ timeout: 1_000 });
  // one plain sentence in the status line, the quota's own words (lib/overview/ask-line.ts refusedLine)
  await expect(statusOf(page)).toHaveAttribute("data-ask-status", "stopped", { timeout: 10_000 });
  await expect(statusOf(page)).toHaveText(
    refusedLine({ httpStatus: 429, code: "quota_exhausted", limit: "session" }),
  );
  await expect(keysOf(page)).toHaveText([
    `/${ak["ask.key.again"].text}`,
    "SSources",
    "WLimits",
    "EscBack",
  ]);
  // the steps stay: they never go back to the answer by themselves
  await page.waitForTimeout(5_000);
  await expect(statusOf(page)).toHaveAttribute("data-ask-status", "stopped");
  await expect(readoutOn(page)).toBeHidden();
  // Ask Again opens the Ask with the question kept; Esc closes it and leaves the steps where they were
  await page.keyboard.press("/");
  const input = page.locator("input[name='question']");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(QUESTION);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-ask-overlay][data-open]")).toHaveCount(0);
  await expect(statusOf(page)).toHaveAttribute("data-ask-status", "stopped");
  // Esc: the answer, at once, as it was, saying nothing about the question
  await page.keyboard.press("Escape");
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
  expect(await crumbsOf(page)).toEqual([PLACE, en["overview.crumb.results"].text]);
  await expect(readoutOn(page).locator("[data-readout-request]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/valley$/);
});

test("a question that fails stays on its steps with the sentence its failure code says, and Esc goes back to the answer", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const id = "cmd_e2e_ask_failed";
  const task = "task_e2e_ask_failed";
  // the model is not configured on this server: the follow-up's own task ends failed with that code
  const code = "model_not_configured";
  await askStubs(page, {
    accept: id,
    events: (caseId) => [
      eventOf(caseId, 1, "command.accepted", id, null),
      eventOf(caseId, 2, "task.started", id, task),
      eventOf(caseId, 3, "case.committed", id, task),
      eventOf(caseId, 4, "task.failed", id, task, { resultStatus: "failed" }),
      eventOf(caseId, 5, "command.completed", id, null, { resultStatus: "failed" }),
    ],
    tasks: (caseId) => {
      const at = new Date().toISOString();
      return [
        {
          recordType: "Task",
          id: task,
          revision: 1,
          createdAt: at,
          updatedAt: at,
          caseId,
          commandId: id,
          kind: "source_research",
          question: QUESTION,
          status: "failed",
          dependsOnTaskIds: [],
          inputVersions: [],
          allowedTools: ["search_sources", "read_source", "propose_evidence"],
          outputEntityIds: [],
          idempotencyKey: `source-task-${task}`,
          attempt: 0,
          maxModelRounds: 1,
          deadlineAt: at,
          budgetMicroUsd: 0,
          spentMicroUsd: 0,
          checkpointId: null,
          failureCode: code,
          missingInputs: [],
          startedAt: at,
          finishedAt: at,
        },
      ];
    },
  });
  await atTheAnswer(page);
  await ask(page);
  await expect(page.locator("[data-at-work][data-run-layer]")).toBeVisible({ timeout: 1_000 });
  await expect(statusOf(page)).toHaveAttribute("data-ask-status", "stopped", { timeout: 20_000 });
  await expect(statusOf(page)).toHaveText(ak[failedLine(code)].text);
  await expect(keyOf(page, "/")).toHaveText(`/${ak["ask.key.again"].text}`);
  await expect(keysOf(page).last()).toHaveText("EscBack");
  await page.waitForTimeout(5_000);
  await expect(statusOf(page)).toHaveAttribute("data-ask-status", "stopped");
  await page.keyboard.press("Escape");
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
  await expect(readoutOn(page).locator("[data-readout-request]")).toHaveCount(0);
});

test("the thinking is the run's own: the recording's question and steps from its answer, its last row back to it, and none for another place", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const record = loadedRecord(page);
  await atTheAnswer(page, `/valley?run=${recorded.commandId}`);
  const { listing } = await record;
  await page.keyboard.press("t");
  const work = page.locator("[data-at-work][data-run-layer]");
  await expect(work).toBeVisible({ timeout: 20_000 });
  await expect(work.locator("[data-run-question]")).toHaveText(recorded.question);
  await expect(work.locator("[data-run-replay]")).toHaveCount(0);
  // its last row reads the run's own findings: the run's answer, in its own words
  await work.locator("[data-agent-review] button").click();
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(readoutOn(page)).toBeVisible();
  await expect(readoutOn(page).locator("[data-readout-answer]")).toHaveText(
    answerOf(recorded.snapshot, listing).answer.claim ?? "",
  );

  // another place has no recording: no T, and t switches nothing on
  await atTheAnswer(page, "/valley?case=case_calaveras_creek");
  await expect(page.locator("[data-key-legend] [data-key='T']")).toHaveCount(0);
  await page.keyboard.press("t");
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(page.locator("[data-run-status]")).toHaveCount(0);
  await expect(readoutOn(page)).toBeVisible();
});

test("inside a view opened from the answer, T is not the overview's: it never switches the steps on", async ({
  page,
}) => {
  test.setTimeout(240_000);
  // the run's answer, where T is the steps' key
  await atTheAnswer(page, `/valley?run=${recorded.commandId}`);
  await expect(page.locator("[data-key-legend] [data-key='T']")).toBeVisible();
  // the cut through the elevation bands, opened in place
  await openView(page, "cutaway");
  await expect(page).toHaveURL(new RegExp(`/instruments/cutaway\\?run=${recorded.commandId}$`), {
    timeout: 20_000,
  });
  await expect(page.locator("[data-instrument='cutaway']").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press("t");
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
  await expect(page.locator("[data-overview-root][data-at-work]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/instruments\/cutaway/);
  // Esc: back on the same run's answer at once, and still no steps
  await page.keyboard.press("Escape");
  await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
  await expect(page).toHaveURL(new RegExp(`/valley\\?run=${recorded.commandId}$`));
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-at-work]")).toHaveCount(0);
});
