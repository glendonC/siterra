import { expect, test, type Page } from "@playwright/test";
import type { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { versionOf } from "../lib/ask/findings";
import { leadSourcesOf, loadViewLeads } from "../lib/ask/leads";
import { en, format } from "../lib/copy/en";
import { rd } from "../lib/copy/readout";
import { latestMerge } from "../lib/readout/readout";
import { VIEW_HREF, VIEW_LABEL } from "../lib/overview/actions";
import { answerOf, atTheAnswer, crumbsOf, loadedRecord, readoutOn } from "./answer";

// A question typed in the Ask is answered from the case's own findings (lib/ask): its one task names the records of the
// findings its answer chose, in order, and the answer's Follow-up shows those findings word for word, each with its
// source or the row that opens its view. Every route the question takes is answered here (its acceptance, the
// completion call, its events and its task in the case record, as the completion route writes them): no question
// reaches the server and no model is called. The expected words come from the record and the view's own data.

test.use({ viewport: { width: 1440, height: 900 } });

const PLACE = "Aït Bouguemez valley";
const COMMAND = "cmd_e2e_askanswer";
const TASK = "task_ask_e2e0a1";

type Choose = (snapshot: CaseSnapshot) => string[];

/** An event of the question's own, in the shape the completion route writes (lib/live-place/follow-up.ts). */
function eventOf(
  caseId: string,
  sequence: number,
  kind: string,
  taskId: string | null,
  extra: Record<string, unknown> = {},
) {
  return {
    recordType: "Event",
    schemaVersion: "1.22.0",
    id: `evt_e2e_askanswer_${String(sequence).padStart(4, "0")}`,
    caseId,
    sequence,
    occurredAt: new Date().toISOString(),
    kind,
    commandId: COMMAND,
    taskId,
    caseRevision: 1,
    entityIds: [taskId ?? COMMAND],
    message: kind,
    dedupeKey: `e2e.askanswer.${kind}.${String(sequence)}`,
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
 * Answers every route the question takes: its acceptance, the completion call, a cancel, the case's event stream (the
 * task's events once the command is accepted) and the case record (the task, naming the chosen records at the
 * revisions the case holds, added once the command is accepted).
 */
async function askStubs(page: Page, choose: Choose) {
  let caseId = "";
  let question = "";
  let accepted = false;
  await page.route(/\/api\/cases\/[^/]+\/commands$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    caseId =
      /\/api\/cases\/([^/]+)\/commands$/.exec(new URL(route.request().url()).pathname)?.[1] ?? "";
    question = (JSON.parse(route.request().postData() ?? "{}") as { text?: string }).text ?? "";
    await new Promise((r) => setTimeout(r, 800));
    accepted = true;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ recordType: "Command", id: COMMAND, caseId }),
    });
  });
  await page.route("**/api/cases/*/commands/*/complete", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"skipped"}' }),
  );
  await page.route("**/api/commands/*/cancel", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/cases/*/events*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: accepted
        ? [
            eventOf(caseId, 1, "command.accepted", null),
            eventOf(caseId, 2, "task.started", TASK),
            eventOf(caseId, 3, "case.committed", TASK),
            eventOf(caseId, 4, "task.succeeded", TASK, { resultStatus: "succeeded" }),
            eventOf(caseId, 5, "command.completed", null, { resultStatus: "succeeded" }),
          ]
            .map((e) => `id: ${String(e.sequence)}\ndata: ${JSON.stringify(e)}\n\n`)
            .join("")
        : "",
    }),
  );
  await page.route(/\/api\/cases\/[^/]+(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET" || !accepted) return route.fallback();
    const res = await route.fetch();
    if (!res.ok()) return route.fulfill({ response: res });
    const body = (await res.json()) as CaseSnapshot;
    body.records.taskRecords.push(taskOf(body, choose(body), question));
    return route.fulfill({ response: res, json: body });
  });
}

/** The question's task as the completion route commits it (lib/live-place/follow-up.ts followUpTask). */
function taskOf(snapshot: CaseSnapshot, chosen: readonly string[], question: string) {
  const at = new Date().toISOString();
  return {
    recordType: "Task" as const,
    id: TASK,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId: snapshot.case.id,
    commandId: COMMAND,
    kind: "source_research" as const,
    question,
    status: "succeeded" as const,
    dependsOnTaskIds: [],
    inputVersions: chosen.flatMap((id) => versionOf(snapshot, id) ?? []),
    allowedTools: ["read_case" as const, "read_evidence" as const],
    outputEntityIds: [],
    idempotencyKey: `ask-task-${TASK}`,
    attempt: 0,
    maxModelRounds: 1,
    deadlineAt: at,
    budgetMicroUsd: 0,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: at,
    finishedAt: at,
  };
}

const QUESTION = "How much of the valley's greenness change does wet-season rainfall explain?";

/** Types the question in the Ask over the answer and sends it. */
async function ask(page: Page, question = QUESTION) {
  await page.keyboard.press("/");
  await expect(page.locator("input[name='question']")).toBeFocused();
  await page.keyboard.type(question);
  await page.keyboard.press("Enter");
}

/** The rain view's spec and the rainfall explanation's branch, as the case record names them. */
const rainChoice: Choose = (snapshot) => {
  const spec = snapshot.records.instrumentSpecRecords?.find(
    (s) => s.parameters.kind === "rainfall_scatter" && s.status === "ready",
  );
  const branch = latestMerge(snapshot)?.branches.find((b) => b.explanationId === "rainfall");
  if (!spec || !branch) throw new Error("the case holds no rain view or rainfall explanation");
  return [spec.id, branch.branchId];
};

/** A view's lead as the column reads it: through the page's own session, from the view's own data. */
async function leadOf(page: Page, snapshot: CaseSnapshot, listing: InstrumentListing) {
  const leads = await loadViewLeads(
    leadSourcesOf(snapshot),
    listing,
    async (input) => {
      const res = await page.request.get(input);
      return new Response(new Uint8Array(await res.body()), {
        status: res.status(),
        headers: res.headers(),
      });
    },
    ["rainfall"],
  );
  return leads.rainfall ?? [];
}

test("a typed question's answer is the case's own findings its task chose, word for word, and a view's row opens it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await askStubs(page, rainChoice);
  const record = loadedRecord(page);
  await atTheAnswer(page);
  const { snapshot, listing } = await record;
  await ask(page);

  // the steps count the findings the answer chose, then hand over to the answer the address names
  const work = page.locator("[data-at-work][data-run-layer]");
  await expect(work.locator("[data-ask-status]")).toHaveAttribute("data-ask-status", "answered", {
    timeout: 30_000,
  });
  await expect(work.locator("[data-run-status]")).toHaveText(
    new RegExp(`^${format("run.findings", { n: 2, time: "\\d+\\.\\d" })}$`),
  );
  await expect(readoutOn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`[?&]run=${COMMAND}`));

  // the Follow-up: the question, then each chosen finding in the words its view or the column gives it
  const asked = { ...snapshot, records: { ...snapshot.records } };
  asked.records.taskRecords = [
    ...snapshot.records.taskRecords,
    taskOf(snapshot, rainChoice(snapshot), QUESTION),
  ];
  const chosen = answerOf(asked, listing, COMMAND).request?.findings ?? [];
  const rain = await leadOf(page, snapshot, listing);
  expect(rain.length).toBeGreaterThan(0);
  expect(chosen.map((f) => f.place.kind)).toEqual(["view", "verdict"]);
  const followUp = readoutOn(page).locator("[data-readout-request]");
  await expect(followUp.locator("dt")).toHaveText(rd["readout.request.head"].text);
  await expect(followUp.locator("dd > p").first()).toHaveText(QUESTION);
  const findings = followUp.locator("[data-readout-request-finding]");
  await expect(findings).toHaveCount(2);
  await expect(findings.nth(0).locator("p")).toHaveText(rain);
  await expect(findings.nth(1).locator("p")).toHaveText(chosen[1]?.lines ?? []);
  await expect(followUp).not.toContainText(rd["readout.request.none"].text);

  // the view's row opens that view, in place, under its own name
  const label = en[VIEW_LABEL.rainfall].text;
  await findings.nth(0).getByRole("button", { name: label }).click();
  await expect(page).toHaveURL(new RegExp(`${VIEW_HREF.rainfall}(\\?|$)`), { timeout: 15_000 });
  await expect(page.locator("[data-instrument='rainfall']").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(async () => (await crumbsOf(page)).slice(-3))
    .toEqual([PLACE, en["overview.crumb.results"].text, label]);
});

test("a typed question the case has no finding on: its Follow-up says so in one sentence", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await askStubs(page, () => []);
  await atTheAnswer(page);
  await ask(page, "Who decides when the shared pastures open and close?");
  await expect(readoutOn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`[?&]run=${COMMAND}`));
  const followUp = readoutOn(page).locator("[data-readout-request]");
  await expect(followUp.locator("dd > p")).toHaveText([
    "Who decides when the shared pastures open and close?",
    rd["readout.request.none"].text,
  ]);
  await expect(followUp.locator("[data-readout-request-finding]")).toHaveCount(0);
});
