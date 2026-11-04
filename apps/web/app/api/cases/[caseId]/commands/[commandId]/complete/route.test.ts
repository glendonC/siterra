// The completion route of a question typed in the Ask, on a real database (a fresh one for this file on DATABASE_URL):
// the demo case (the seed with the recorded 28 Oct merge, its scored branches and the synthetic package whose brief is
// the case's current one) with its bundles read from data/bundles, and questions sent to it. Only the model's HTTP
// reply is a stub, so the findings list, the one call, the reading of its reply and the commit are the route's own,
// and the claim, the commit, the events and the command's status are the database's.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CaseSnapshot,
  type EnvironmentalCase,
  type ExplanationBranch,
  Task,
  caseSchemaVersion,
} from "@siterra/contracts";
import {
  type CommitProposal,
  type Pool,
  applyCommit,
  createSession,
  eventsAfter,
  findBundlesDir,
  loadSeedCase,
  readInstruments,
  readSnapshot,
  requestCancel,
  sessionCookieName,
  submitCommand,
} from "@siterra/db";
import {
  type TestDatabase,
  exampleCommandRequest,
  exampleEvidence,
  freshDatabase,
} from "@siterra/db/testing";
import { newId } from "@siterra/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en, format } from "../../../../../../../lib/copy/en.ts";
import type * as Reasoner from "../../../../../../../lib/live-place/llm-reasoner.ts";
import type { LlmConfig } from "../../../../../../../lib/live-place/llm-reasoner.ts";
import { bandLimitsOf } from "../../../../../../../lib/land/record.ts";
import { askLine } from "../../../../../../../lib/overview/ask-line.ts";
import { findingsFrom } from "../../../../../../../lib/overview/findings.ts";
import {
  type RecordedRun,
  withSyntheticPackage,
} from "../../../../../../../lib/package/fixtures/synthetic.ts";
import { readoutOf } from "../../../../../../../lib/readout/readout.ts";
import type * as Route from "./route.ts";

const h = vi.hoisted(() => ({ config: vi.fn<() => LlmConfig | null>() }));

vi.mock("../../../../../../../lib/live-place/llm-reasoner.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof Reasoner>()),
  resolveLlmConfig: h.config,
}));

const FIXTURES = join(
  import.meta.dirname,
  ...Array.from({ length: 9 }, () => ".."),
  "packages",
  "contracts",
  "fixtures",
);
const read = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
const seed = read("case-snapshot-aitbouguemez-seed.json") as CaseSnapshot;
const run = (read("recorded-live-run-2026-10-28-branch-merge.json") as { records: RecordedRun })
  .records;
// the case before any follow-up: the recorded merge and its scored branches, and the brief it points to
const pkg = withSyntheticPackage(seed, run);
const CASE_ID = pkg.snapshot.case.id;
const OWNER = "owner_example_follow_up";
const ORIGIN = "http://127.0.0.1:4350";
const NOW = "2026-11-03T10:00:00.000Z";
const CONFIG: LlmConfig = {
  provider: "meta",
  model: "muse-spark-1.3",
  apiKey: "test-only-not-a-key",
  baseUrl: "https://model.invalid/v1",
};

// the findings the questions here expect, as the column and the views word them
const RAIN_LEAD =
  "Year to year, March to June greenness follows September to May rainfall only weakly.";
const RAIN_VERDICT = "Rainfall does not fit the evidence.";
const GRAZING_VERDICT = "Not enough data yet on grazing.";
const HERD_CHECK = "Herd numbers and routes by season would tell grazing from snow or terrain.";
const RAIN_SPEC = "inst_rainfall_scatter_valley";
const RAIN_BRANCH = "branch_338b5acb3a5443b5e287905d70032a91";
// the model's own words, written so they can be searched for in everything the follow-up wrote and shows
const PROSE = "Model prose: grazing explains the change and the brief should say so.";

const shared = globalThis as typeof globalThis & { siterraPool?: Pool };
let db: TestDatabase;
let route: typeof Route;
let cookie = "";
let asked = 0;
/** What the model was sent, call by call. */
let sent: { url: string; text: string }[] = [];

/** The case as it stands before any follow-up, loaded as a seed with the rest of its records as they are. */
async function loadCase(pool: Pool): Promise<void> {
  const s = pkg.snapshot;
  await loadSeedCase(
    pool,
    {
      caseRecord: { ...s.case, revision: 1, currentBriefId: pkg.briefId },
      geoSelections: s.records.geoSelectionRecords,
      sources: s.records.sourceRecords,
      bundles: [],
      contextFeatures: s.records.contextFeatureRecords ?? [],
      evidence: [],
      instruments: [],
    },
    OWNER,
  );
  const loaded = new Set([
    "geoSelectionRecords",
    "sourceRecords",
    "contextFeatureRecords",
    "reviewDecisionRecords",
  ]);
  for (const [key, list] of Object.entries(s.records)) {
    if (loaded.has(key)) continue;
    for (const r of list as readonly { id: string; revision: number; recordType: string }[]) {
      await pool.query(
        `insert into records (case_id, entity_id, revision, record_type, record, case_revision)
         values ($1, $2, $3, $4, $5, 1)`,
        [CASE_ID, r.id, r.revision, r.recordType, JSON.stringify(r)],
      );
    }
  }
}

/** The finding ids the model was offered, by the words of each finding. */
function offered(text: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const line of text.split("\n")) {
    const [, id, words] = /^(f\d+) \[[^\]]*\] (.*)$/.exec(line) ?? [];
    if (id && words) ids.set(words, id);
  }
  return ids;
}

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** A model reply naming the findings with these words (and some prose of its own besides), or a reply as given. */
function model(reply: { choose: readonly string[] } | { status: number } | { text: string }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = typeof init?.body === "string" ? init.body : "{}";
    const text =
      (JSON.parse(body) as { input?: { content: { text: string }[] }[] }).input?.[0]?.content[0]
        ?.text ?? "";
    sent.push({ url: urlOf(input), text });
    if ("status" in reply)
      return Promise.resolve(
        new Response(JSON.stringify({ error: PROSE }), { status: reply.status }),
      );
    const out =
      "text" in reply
        ? reply.text
        : JSON.stringify({
            ids: [...reply.choose.map((words) => offered(text).get(words) ?? words), "f99", PROSE],
            answer: PROSE,
          });
    return Promise.resolve(
      new Response(JSON.stringify({ output_text: out }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  route = await import("./route.ts");
  await loadCase(db.pool);
  cookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: OWNER, kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraPool?.end();
  await db.drop();
});

beforeEach(() => {
  sent = [];
  h.config.mockReturnValue(CONFIG);
  vi.stubGlobal("fetch", model({ choose: [] }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function ask(text = "Does wet-season rainfall explain the greening?"): Promise<string> {
  asked += 1;
  const outcome = await submitCommand(db.pool, {
    caseId: CASE_ID,
    ownerScopeId: OWNER,
    request: exampleCommandRequest(`follow-up-test-${String(asked)}`, text),
  });
  if (outcome.status !== "created") throw new Error(`The command was ${outcome.status}`);
  return outcome.command.id;
}

function complete(commandId: string, body: object = {}): Promise<Response> {
  return route.POST(
    new Request(`${ORIGIN}/api/cases/${CASE_ID}/commands/${commandId}/complete`, {
      method: "POST",
      headers: {
        cookie,
        origin: ORIGIN,
        host: new URL(ORIGIN).host,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId: CASE_ID, commandId }) },
  );
}

async function current(): Promise<CaseSnapshot> {
  const snap = await readSnapshot(db.pool, CASE_ID, OWNER);
  if (!snap) throw new Error("The case is not readable");
  return snap;
}

/** The record rows the command's commits wrote. */
async function written(commandId: string) {
  const rows = await db.pool.query<{
    record_type: string;
    record: { id: string; status?: string };
    case_revision: number;
  }>(
    `select r.record_type, r.record, r.case_revision from records r
     join commits c on c.case_id = r.case_id and c.id = r.commit_id
     where c.command_id = $1 order by r.record_type, r.entity_id`,
    [commandId],
  );
  return rows.rows;
}

async function eventsOf(commandId: string) {
  return (await eventsAfter(db.pool, CASE_ID, 0, 5000)).filter((e) => e.commandId === commandId);
}

async function taskOf(commandId: string): Promise<Task> {
  return Task.parse((await written(commandId)).find((r) => r.record_type === "Task")?.record);
}

async function statusOf(commandId: string): Promise<string | undefined> {
  const rows = await db.pool.query<{ status: string }>(
    "select status from commands where id = $1",
    [commandId],
  );
  return rows.rows[0]?.status;
}

/** The answer column for the question, as the page builds it from the case and its listing. */
async function columnOf(commandId: string) {
  const snap = await current();
  const listing = await readInstruments(db.pool, {
    caseId: CASE_ID,
    ownerScopeId: OWNER,
    bundlesDir: findBundlesDir(process.cwd()),
  });
  if (!listing) throw new Error("The case has no listing");
  return readoutOf(snap, findingsFrom(snap, listing).findings, "", {
    commandId,
    limits: bandLimitsOf(snap),
  });
}

/** The work card's line for the command once the session holds the case and its events. */
async function askLineOf(commandId: string) {
  const events = await eventsAfter(db.pool, CASE_ID, 0, 5000);
  return askLine({
    snapshot: await current(),
    log: { events, lastSequence: events.at(-1)?.sequence ?? 0 },
    commandId,
    sent: true,
    notice: null,
    pacing: false,
  });
}

const everything = async (commandId: string): Promise<string> =>
  JSON.stringify({
    records: await written(commandId),
    events: await eventsOf(commandId),
    column: (await columnOf(commandId)).request,
  });

/** A commit another request makes while the follow-up waits on the model; returns the revision it made. */
async function commitElsewhere(upserts: CommitProposal["upserts"]): Promise<number> {
  const row = (
    await db.pool.query<{ revision: number; record: EnvironmentalCase }>(
      "select revision, record from cases where id = $1",
      [CASE_ID],
    )
  ).rows[0];
  if (!row) throw new Error("The case is gone");
  const outcome = await applyCommit(db.pool, {
    recordType: "Commit",
    schemaVersion: caseSchemaVersion,
    id: newId("commit"),
    caseId: CASE_ID,
    commandId: "cmd_concurrent_example",
    taskId: "task_concurrent_example",
    expectedCaseRevision: row.revision,
    newCaseRevision: row.revision + 1,
    idempotencyKey: `concurrent-${newId("key")}`,
    inputVersions: [],
    caseAfter: { ...row.record, revision: row.revision + 1, updatedAt: NOW },
    upserts,
    layoutActions: [],
    events: [
      {
        occurredAt: NOW,
        kind: "case.committed",
        commandId: null,
        taskId: null,
        entityIds: upserts.map((u) => u.id),
        message: "Committed by another request.",
        dedupeKey: `concurrent-${newId("evt")}`,
        resultStatus: null,
        tool: null,
        usage: null,
        validation: null,
        spanId: null,
        parentSpanId: null,
      },
    ],
    resultKey: null,
  });
  if (outcome.status !== "committed") throw new Error(`The other commit was ${outcome.status}`);
  return outcome.commit.newCaseRevision;
}

describe("a question answered from the case's own findings", () => {
  it("offers the model, in one call, the case's findings as the column and the views word them", async () => {
    const id = await ask(
      "How much of the valley's greenness change does wet-season rainfall explain?",
    );
    await complete(id);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${CONFIG.baseUrl}/responses`);
    const words = offered(sent[0]?.text ?? "");
    for (const said of [
      "Since 2000, 24.7% of the area has greened and 0.1% has browned.",
      RAIN_VERDICT,
      GRAZING_VERDICT,
      HERD_CHECK,
      RAIN_LEAD,
      "Of the pixels that stepped up to greener, half did so by 2011.",
    ])
      expect(words.has(said), said).toBe(true);
    expect(sent[0]?.text).toContain(
      "Question: How much of the valley's greenness change does wet-season rainfall explain?",
    );
  });

  it("records the chosen findings' records in the answer's order, writes only its task, and the column shows them", async () => {
    vi.stubGlobal("fetch", model({ choose: [RAIN_LEAD, RAIN_VERDICT] }));
    const before = await current();
    const id = await ask();
    const res = await complete(id);
    expect(await res.json()).toEqual({
      status: "completed",
      commandId: id,
      revision: before.case.revision + 1,
    });
    expect((await written(id)).map((r) => r.record_type)).toEqual(["Task"]);
    const task = await taskOf(id);
    expect(task).toMatchObject({
      id: expect.stringMatching(/^task_ask_[0-9a-f]{6}$/) as string,
      kind: "source_research",
      status: "succeeded",
      question: "Does wet-season rainfall explain the greening?",
      outputEntityIds: [],
      inputVersions: [
        { entityId: RAIN_SPEC, revision: 1 },
        { entityId: RAIN_BRANCH, revision: 2 },
      ],
    });
    expect(await statusOf(id)).toBe("succeeded");
    expect((await eventsOf(id)).map((e) => [e.kind, e.message])).toEqual([
      ["command.accepted", "Request received"],
      ["task.started", "Reading the case's findings for Aït Bouguemez valley."],
      ["model.started", "Model call to muse-spark-1.3 (Model API) started."],
      ["model.completed", "Model call to muse-spark-1.3 (Model API) finished."],
      ["case.committed", "Committed the question's task for Aït Bouguemez valley."],
      ["task.succeeded", "Source research task chose 2 findings of the case."],
      ["command.completed", "Command completed."],
    ]);
    const shown = (await columnOf(id)).request;
    expect(shown?.answered).toBe(true);
    expect(shown?.question).toBe("Does wet-season rainfall explain the greening?");
    expect(shown?.findings.map((f) => [f.id, f.place, f.lines])).toEqual([
      [RAIN_SPEC, { kind: "view", view: "rainfall" }, null],
      [RAIN_BRANCH, { kind: "verdict" }, [RAIN_VERDICT]],
    ]);
  });

  it("answers a cause from the verdict and the check that would settle it", async () => {
    vi.stubGlobal("fetch", model({ choose: [GRAZING_VERDICT, HERD_CHECK] }));
    const id = await ask("Is grazing the cause?");
    await complete(id);
    expect((await columnOf(id)).request?.findings.map((f) => f.lines)).toEqual([
      [GRAZING_VERDICT],
      [HERD_CHECK],
    ]);
  });

  it("keeps no word the model writes, in any record, event or line shown", async () => {
    vi.stubGlobal("fetch", model({ choose: [RAIN_VERDICT] }));
    const id = await ask();
    await complete(id);
    expect((await columnOf(id)).request?.findings.map((f) => f.lines)).toEqual([[RAIN_VERDICT]]);
    expect(await everything(id)).not.toContain("Model prose");
  });

  it("says the case has no finding on it when the model names none the case holds", async () => {
    vi.stubGlobal("fetch", model({ text: JSON.stringify({ ids: ["f99", PROSE] }) }));
    const id = await ask("Who decides when the shared pastures open and close?");
    await complete(id);
    expect(await taskOf(id)).toMatchObject({ status: "succeeded", inputVersions: [] });
    expect((await eventsOf(id)).find((e) => e.kind === "task.succeeded")?.message).toBe(
      "Source research task found no finding of the case that answers the question.",
    );
    expect((await columnOf(id)).request).toMatchObject({ answered: true, findings: [] });
  });

  it("writes no Source, Evidence, branch, merge or brief, and leaves the case's current brief where it is", async () => {
    vi.stubGlobal("fetch", model({ choose: [RAIN_LEAD] }));
    const before = await current();
    const id = await ask();
    await complete(id, { liveSearch: true });
    expect(sent).toHaveLength(1);
    const after = await current();
    for (const key of [
      "sourceRecords",
      "evidenceRecords",
      "explanationBranchRecords",
      "branchMergeRecords",
      "briefRecords",
    ] as const)
      expect(after.records[key]).toEqual(before.records[key]);
    expect(after.case.currentBriefId).toBe(pkg.briefId);
    expect(await askLineOf(id)).toEqual({ text: en["ask.complete"].text, findings: 0 });
  });
});

describe("a question the model gives no usable answer", () => {
  it("records the task as failed with the transport's cause, and the Ask line says so", async () => {
    vi.stubGlobal("fetch", model({ status: 503 }));
    const id = await ask();
    const res = await complete(id);
    expect(await res.json()).toMatchObject({ status: "failed", commandId: id });
    expect(await taskOf(id)).toMatchObject({
      status: "failed",
      failureCode: "http_503",
      inputVersions: [],
      outputEntityIds: [],
    });
    const events = await eventsOf(id);
    expect(events.find((e) => e.kind === "model.completed")?.usage).toMatchObject({
      provider: "meta_model_api",
      model: "muse-spark-1.3",
      status: "failed",
      estimatedCostMicroUsd: null,
    });
    expect(events.find((e) => e.kind === "task.failed")?.message).toBe(
      "Source research task failed: http_503.",
    );
    expect(events.find((e) => e.kind === "command.completed")?.resultStatus).toBe("failed");
    expect(await statusOf(id)).toBe("failed");
    expect((await askLineOf(id))?.text).toBe(
      format("work.failed", { cause: en["work.cause.modelDown"].text }),
    );
    expect(await everything(id)).not.toContain("Model prose");
  });

  it("fails when the reply is not the object asked for", async () => {
    vi.stubGlobal("fetch", model({ text: PROSE }));
    const id = await ask();
    await complete(id);
    expect(await taskOf(id)).toMatchObject({
      status: "failed",
      failureCode: "reply_unreadable",
    });
    expect(await everything(id)).not.toContain("Model prose");
  });

  it("fails without calling the model when none is configured", async () => {
    h.config.mockReturnValue(null);
    const id = await ask();
    await complete(id);
    expect(sent).toHaveLength(0);
    expect(await taskOf(id)).toMatchObject({
      status: "failed",
      failureCode: "model_not_configured",
    });
    expect((await eventsOf(id)).some((e) => e.kind.startsWith("model."))).toBe(false);
    expect(await statusOf(id)).toBe("failed");
  });
});

describe("taking the command", () => {
  it("runs a command once: a second request for it is skipped", async () => {
    const id = await ask();
    const responses = await Promise.all([complete(id), complete(id)]);
    const statuses = await Promise.all(
      responses.map(async (r) => ((await r.json()) as { status: string }).status),
    );
    expect(statuses.sort()).toEqual(["completed", "skipped"]);
    expect(sent).toHaveLength(1);
    const commits = await db.pool.query("select id from commits where command_id = $1", [id]);
    expect(commits.rowCount).toBe(1);
  });

  it("withdraws the plan job of the command it takes, so the worker never runs it too", async () => {
    const id = await ask();
    await complete(id);
    const jobs = await db.pool.query("select id from outbox where command_id = $1", [id]);
    expect(jobs.rowCount).toBe(0);
  });

  it("leaves a command whose plan job the worker already took", async () => {
    const id = await ask();
    await db.pool.query("update outbox set dispatched_at = now() where command_id = $1", [id]);
    expect(await (await complete(id)).json()).toEqual({ status: "skipped" });
    expect(await statusOf(id)).toBe("accepted");
    expect(await written(id)).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});

describe("the follow-up's revision", () => {
  it("lands after revisions other requests commit during the model call, never on an older one", async () => {
    const before = (await current()).case.revision;
    let elsewhere = 0;
    const reply = model({ choose: [RAIN_VERDICT] });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      await commitElsewhere([exampleEvidence(CASE_ID, "ev_example_concurrent_1")]);
      elsewhere = await commitElsewhere([exampleEvidence(CASE_ID, "ev_example_concurrent_2")]);
      return reply(input, init);
    });
    const id = await ask();
    const res = await complete(id);
    expect(elsewhere).toBe(before + 2);
    expect(await res.json()).toMatchObject({ status: "completed", revision: before + 3 });
    const commit = await db.pool.query<{
      expected_case_revision: number;
      new_case_revision: number;
    }>("select expected_case_revision, new_case_revision from commits where command_id = $1", [id]);
    expect(commit.rows).toEqual([
      { expected_case_revision: before + 2, new_case_revision: before + 3 },
    ]);
    expect((await written(id)).map((r) => r.case_revision)).toEqual([before + 3]);
    const revisions = await db.pool.query<{ revision: number }>(
      "select revision from case_revisions where case_id = $1 order by revision",
      [CASE_ID],
    );
    const all = revisions.rows.map((r) => r.revision);
    expect(all.at(-1)).toBe(before + 3);
    expect(all).toEqual(Array.from({ length: all.length }, (_, i) => i + 1));
    expect((await taskOf(id)).inputVersions).toEqual([{ entityId: RAIN_BRANCH, revision: 2 }]);
  });

  it("ends cancelled and names nothing when the command is cancelled during the model call", async () => {
    const id = await ask();
    const reply = model({ choose: [RAIN_VERDICT] });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      await requestCancel(db.pool, { commandId: id, ownerScopeId: OWNER });
      return reply(input, init);
    });
    expect(await (await complete(id)).json()).toMatchObject({ status: "cancelled", commandId: id });
    expect((await written(id)).map((r) => r.record_type)).toEqual(["Task"]);
    expect(await taskOf(id)).toMatchObject({ status: "cancelled", inputVersions: [] });
    expect((await eventsOf(id)).map((e) => e.kind)).toEqual(
      expect.arrayContaining(["model.completed", "task.cancelled", "command.completed"]),
    );
    expect(await statusOf(id)).toBe("cancelled");
    expect((await askLineOf(id))?.text).toBe(en["work.cancelled"].text);
  });

  // last: it gives a branch a newer revision, which every later question would read
  it("keeps nothing when a record a chosen finding is built from changes during the model call", async () => {
    const branch = (await current()).records.explanationBranchRecords?.find(
      (b) => b.id === RAIN_BRANCH,
    ) as ExplanationBranch;
    const reply = model({ choose: [RAIN_VERDICT] });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      await commitElsewhere([{ ...branch, revision: branch.revision + 1, updatedAt: NOW }]);
      return reply(input, init);
    });
    const id = await ask();
    expect(await (await complete(id)).json()).toMatchObject({ status: "failed", commandId: id });
    expect((await written(id)).map((r) => r.record_type)).toEqual(["Task"]);
    expect(await taskOf(id)).toMatchObject({
      status: "failed",
      failureCode: "stale_inputs",
      inputVersions: [],
    });
    expect(await statusOf(id)).toBe("failed");
  });
});
