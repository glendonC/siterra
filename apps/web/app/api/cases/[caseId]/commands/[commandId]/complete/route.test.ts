// The follow-up completion route on a real database (a fresh one for this file on DATABASE_URL): a case whose first
// command scored its explanation branches (the recorded 28 Oct merge) and whose current brief another command wrote,
// and follow-up commands sent to it. The model, the live search and the terrain file are stubs; the claim, the
// commit, the events and the command's status are the database's own.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CaseSnapshot,
  type EnvironmentalCase,
  type Evidence,
  type Source,
  Task,
  caseSchemaVersion,
} from "@siterra/contracts";
import {
  type CommitProposal,
  type Pool,
  applyCommit,
  createSession,
  eventsAfter,
  loadSeedCase,
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
import type {
  LlmConfig,
  LlmReasonerInput,
  LlmReasonerOutput,
  LlmVerifiedFinding,
} from "../../../../../../../lib/live-place/llm-reasoner.ts";
import { askLine } from "../../../../../../../lib/overview/ask-line.ts";
import {
  type RecordedRun,
  withSyntheticPackage,
} from "../../../../../../../lib/package/fixtures/synthetic.ts";
import type * as Route from "./route.ts";

const h = vi.hoisted(() => ({
  reason: vi.fn<(input: LlmReasonerInput) => Promise<LlmReasonerOutput | null>>(),
  config: vi.fn<() => LlmConfig | null>(),
  openAlex: vi.fn<() => Promise<Source[]>>(),
  regional: vi.fn<() => Promise<{ contextSources: Source[]; contextEvidence: Evidence[] }>>(),
  government: vi.fn<() => Promise<{ sources: Source[]; evidence: Evidence[] }>>(),
}));

vi.mock("../../../../../../../lib/live-place/llm-reasoner.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof Reasoner>()),
  reasonOverCaseWithLlm: h.reason,
  resolveLlmConfig: h.config,
}));
vi.mock("../../../../../../../lib/live-place/terrain-builder.ts", () => ({
  terrainCachePath: () => "/nonexistent/siterra-follow-up-test/terrain.json",
}));
vi.mock("../../../../../../../lib/live-place/literature.ts", () => ({
  fetchOpenAlexSources: h.openAlex,
}));
vi.mock("../../../../../../../lib/live-place/context-fetcher.ts", () => ({
  fetchRegionalContextAndGovernance: h.regional,
}));
vi.mock("../../../../../../../lib/live-place/government-policy-fetcher.ts", () => ({
  fetchGovernmentPolicyAndOpenAccess: h.government,
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
const SCI03 = pkg.snapshot.records.sourceRecords.find((s) => s.id === "src_SCI-03") as Source;

// the model's free text, each piece written so it can be searched for in everything the follow-up wrote
const SUMMARY = "Model summary: grazing explains the change and the brief should say so.";
const answer = (verifiedFindings: LlmVerifiedFinding[] = []): LlmReasonerOutput => ({
  provider: "meta",
  model: "muse-spark-1.3",
  hypotheses: [],
  interventions: [],
  causes: (["rainfall", "grazing", "land_use", "snow_terrain", "data_artefact"] as const).map(
    (explanationId) => ({
      explanationId,
      statement: `Model statement for ${explanationId}: settled by the follow-up.`,
      statusReason: `Model reason for ${explanationId}: tested by the follow-up.`,
      prediction: `Model prediction for ${explanationId}, reworded after scoring.`,
      fieldCheck: { what: "Model field check", method: "Model method", seasonWindow: "Spring" },
    }),
  ),
  verifiedFindings,
  briefSummary: SUMMARY,
});
const MODEL_TEXT = [
  SUMMARY,
  ...answer().causes.flatMap((c) => [c.statement, c.statusReason, c.prediction]),
];
// a paraphrase of a note the seed's src_SCI-03 holds (no number in it): kept, but only as provisional
const PARAPHRASE: LlmVerifiedFinding = {
  statement: "The full text of this study was read again before its excerpts were checked.",
  sourceId: "src_SCI-03",
  exactQuote: SCI03.notes[0] ?? "",
  interpretation: "Grazing is the main driver of the change.",
};

const shared = globalThis as typeof globalThis & { siterraPool?: Pool };
let db: TestDatabase;
let route: typeof Route;
let cookie = "";
let asked = 0;

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
  h.config.mockReturnValue(CONFIG);
  h.reason.mockResolvedValue(answer());
  h.openAlex.mockResolvedValue([]);
  h.regional.mockResolvedValue({ contextSources: [], contextEvidence: [] });
  h.government.mockResolvedValue({ sources: [], evidence: [] });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function ask(text = "Why did the upper slopes stay green in 2023?"): Promise<string> {
  asked += 1;
  const outcome = await submitCommand(db.pool, {
    caseId: CASE_ID,
    ownerScopeId: OWNER,
    request: exampleCommandRequest(`follow-up-test-${String(asked)}`, text),
  });
  if (outcome.status !== "created") throw new Error(`The command was ${outcome.status}`);
  return outcome.command.id;
}

function complete(commandId: string, body: object = { liveSearch: false }): Promise<Response> {
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

/** The Ask line for the command once the session holds the case and its events. */
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
  JSON.stringify({ records: await written(commandId), events: await eventsOf(commandId) });

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

describe("a follow-up question that runs no scoring", () => {
  it("writes no BranchMerge or ExplanationBranch, and none for the follow-up's command", async () => {
    const before = await current();
    const id = await ask();
    const res = await complete(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "completed",
      commandId: id,
      revision: before.case.revision + 1,
    });
    expect((await written(id)).map((r) => r.record_type)).toEqual(["Task"]);
    const after = await current();
    expect(after.records.branchMergeRecords).toEqual(before.records.branchMergeRecords);
    expect(after.records.explanationBranchRecords).toEqual(before.records.explanationBranchRecords);
    expect((after.records.branchMergeRecords ?? []).some((m) => m.commandId === id)).toBe(false);
    expect((after.records.explanationBranchRecords ?? []).some((b) => b.commandId === id)).toBe(
      false,
    );
  });

  it("leaves each scored prediction's wording and committed revision, and each merge reason, as scored", async () => {
    const before = await current();
    const branches = before.records.explanationBranchRecords ?? [];
    expect(branches.length).toBeGreaterThan(0);
    const id = await ask();
    await complete(id);
    const after = await current();
    for (const b of branches) {
      const now = after.records.explanationBranchRecords?.find((x) => x.id === b.id);
      expect(now?.revision).toBe(b.revision);
      expect(now?.predictionsCaseRevision).toBe(b.predictionsCaseRevision);
      expect(now?.predictions.map((p) => p.wording)).toEqual(b.predictions.map((p) => p.wording));
      expect(now?.statement).toBe(b.statement);
      expect(now?.statusReason).toBe(b.statusReason);
    }
    expect(
      after.records.branchMergeRecords?.flatMap((m) => m.branches.map((x) => x.reason)),
    ).toEqual(before.records.branchMergeRecords?.flatMap((m) => m.branches.map((x) => x.reason)));
    const text = await everything(id);
    for (const t of MODEL_TEXT) expect(text).not.toContain(t);
  });

  it("leaves the Brief and the case's current brief as they were, and cites no evidence for the model's text", async () => {
    const before = await current();
    const brief = before.records.briefRecords.find((b) => b.id === pkg.briefId);
    expect(brief?.evidenceIds.length).toBeGreaterThan(0);
    const id = await ask();
    await complete(id);
    const after = await current();
    expect(after.records.briefRecords).toEqual(before.records.briefRecords);
    expect(after.case.currentBriefId).toBe(pkg.briefId);
    const text = await everything(id);
    expect(text).not.toContain(SUMMARY);
    // the summary was once cited to the brief's first evidence: nothing the follow-up wrote names any of it
    for (const evidenceId of brief?.evidenceIds ?? []) expect(text).not.toContain(evidenceId);
    expect((await taskOf(id)).outputEntityIds).toEqual([]);
  });

  it("completes the Ask line with no findings when the model answers", async () => {
    const id = await ask();
    await complete(id);
    expect(await statusOf(id)).toBe("succeeded");
    expect(await askLineOf(id)).toEqual({ text: en["ask.complete"].text, findings: 0 });
  });
});

describe("a follow-up question the model gives no usable answer", () => {
  it("records the task as failed with the transport's cause, and the Ask line says so", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 503 })));
    h.reason.mockImplementation(async (input) => {
      await input.fetchImpl?.(`${CONFIG.baseUrl}/responses`, { method: "POST" });
      return null;
    });
    const id = await ask();
    const res = await complete(id);
    expect(await res.json()).toMatchObject({ status: "failed", commandId: id });
    expect(await taskOf(id)).toMatchObject({
      kind: "source_research",
      status: "failed",
      failureCode: "http_503",
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
  });

  it("fails without searching or calling the model when no model is configured", async () => {
    h.config.mockReturnValue(null);
    const id = await ask();
    await complete(id, { liveSearch: true });
    expect(h.reason).not.toHaveBeenCalled();
    expect(h.openAlex).not.toHaveBeenCalled();
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
    expect(h.reason).toHaveBeenCalledTimes(1);
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
    expect(h.reason).not.toHaveBeenCalled();
  });
});

describe("the follow-up's revision", () => {
  it("lands after revisions other requests commit during the model call, never on an older one", async () => {
    const before = (await current()).case.revision;
    let elsewhere = 0;
    h.reason.mockImplementation(async () => {
      await commitElsewhere([exampleEvidence(CASE_ID, "ev_example_concurrent_1")]);
      elsewhere = await commitElsewhere([exampleEvidence(CASE_ID, "ev_example_concurrent_2")]);
      return answer([PARAPHRASE]);
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
    expect((await written(id)).map((r) => r.case_revision)).toEqual([before + 3, before + 3]);

    const head = await db.pool.query<{ revision: number }>(
      "select revision from cases where id = $1",
      [CASE_ID],
    );
    const revisions = await db.pool.query<{ revision: number }>(
      "select revision from case_revisions where case_id = $1 order by revision",
      [CASE_ID],
    );
    const all = revisions.rows.map((r) => r.revision);
    expect(head.rows[0]?.revision).toBe(before + 3);
    expect(all.at(-1)).toBe(before + 3);
    expect(all).toEqual(Array.from({ length: all.length }, (_, i) => i + 1));
    const kept = await current();
    expect(kept.records.evidenceRecords.map((e) => e.id)).toEqual(
      expect.arrayContaining(["ev_example_concurrent_1", "ev_example_concurrent_2"]),
    );
  });

  it("ends cancelled and keeps nothing it found when the command is cancelled during the model call", async () => {
    const id = await ask();
    h.reason.mockImplementation(async () => {
      await requestCancel(db.pool, { commandId: id, ownerScopeId: OWNER });
      return answer([PARAPHRASE]);
    });
    expect(await (await complete(id)).json()).toMatchObject({ status: "cancelled", commandId: id });
    expect((await written(id)).map((r) => r.record_type)).toEqual(["Task"]);
    expect(await taskOf(id)).toMatchObject({ status: "cancelled", outputEntityIds: [] });
    expect((await eventsOf(id)).map((e) => e.kind)).toEqual(
      expect.arrayContaining(["model.completed", "task.cancelled", "command.completed"]),
    );
    expect(await statusOf(id)).toBe("cancelled");
    expect((await askLineOf(id))?.text).toBe(en["work.cancelled"].text);
  });
});

describe("what the follow-up keeps from its sources", () => {
  it("searches the web only when the request asks for it", async () => {
    const id = await ask();
    await complete(id, {});
    expect(h.openAlex).not.toHaveBeenCalled();
    expect(h.government).not.toHaveBeenCalled();
  });

  it("commits them under its own task, keeps the model's paraphrase provisional, and counts accepted findings", async () => {
    const abstract =
      "Upper pastures above 2317 m lost palatable perennial grasses where grazing pressure rose.";
    const retrieved: Source = {
      ...SCI03,
      id: "src_oa_follow_up_test_1",
      sourceKind: "peer_reviewed",
      notes: [abstract],
    };
    const fetched: Evidence = {
      ...(pkg.snapshot.records.evidenceRecords[0] as Evidence),
      id: "ev_gov_follow_up_test_1",
      status: "accepted",
    };
    h.openAlex.mockResolvedValue([retrieved]);
    h.government.mockResolvedValue({ sources: [], evidence: [fetched] });
    h.reason.mockResolvedValue(
      answer([
        {
          statement: "Upper pastures above 2317 m lost palatable perennial grasses.",
          sourceId: retrieved.id,
          exactQuote: abstract,
          interpretation: "Grazing is the main driver of the change.",
        },
        PARAPHRASE,
        {
          statement: "Grazing doubled between 2010 and 2023, removing 45% of palatable cover.",
          sourceId: retrieved.id,
          exactQuote: abstract,
          interpretation: "Grazing is the main driver of the change.",
        },
      ]),
    );
    const id = await ask();
    await complete(id, { liveSearch: true });

    const rows = await written(id);
    expect(rows.map((r) => r.record_type)).toEqual([
      "Evidence",
      "Evidence",
      "Evidence",
      "Source",
      "Task",
    ]);
    const task = await taskOf(id);
    const evidence = rows
      .filter((r) => r.record_type === "Evidence")
      .map((r) => r.record as Evidence);
    expect(task.outputEntityIds.sort()).toEqual(evidence.map((e) => e.id).sort());
    for (const e of evidence) {
      expect(e.provenance.generatedByTaskId).toBe(task.id);
      expect(e.interpretation === null || e.id === fetched.id).toBe(true);
    }
    const byStatus = Object.fromEntries(evidence.map((e) => [e.id, e.status]));
    expect(byStatus).toEqual({
      [fetched.id]: "accepted",
      [`ev_llm_${task.id.slice("task_cmd_".length)}_1`]: "accepted",
      [`ev_llm_${task.id.slice("task_cmd_".length)}_2`]: "provisional",
    });
    expect(await everything(id)).not.toContain("removing 45% of palatable cover");
    expect(task.inputVersions).toEqual([{ entityId: "src_SCI-03", revision: SCI03.revision }]);
    expect((await askLineOf(id))?.findings).toBe(2);
  });

  it("keeps nothing when a source its evidence cites changes during the model call", async () => {
    h.reason.mockImplementation(async () => {
      await commitElsewhere([{ ...SCI03, revision: SCI03.revision + 1, updatedAt: NOW }]);
      return answer([PARAPHRASE]);
    });
    const id = await ask();
    expect(await (await complete(id)).json()).toMatchObject({ status: "failed", commandId: id });
    expect((await written(id)).map((r) => r.record_type)).toEqual(["Task"]);
    expect(await taskOf(id)).toMatchObject({ status: "failed", failureCode: "stale_inputs" });
    expect(await statusOf(id)).toBe("failed");
  });
});
