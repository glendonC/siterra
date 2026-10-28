import { CaseSnapshot, Commit, type ReviewDecision } from "@siterra/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase } from "./cases.ts";
import type { Pool } from "./client.ts";
import { isCancelRequested, requestCancel, setCommandStatus, submitCommand } from "./commands.ts";
import { CommitRejected, applyCommit } from "./commit.ts";
import { appendEvents, eventsAfter } from "./events.ts";
import { migrate } from "./migrate.ts";
import { dispatchOutbox } from "./outbox.ts";
import { readSnapshot } from "./snapshot.ts";
import { type TestDatabase, freshDatabase } from "./test-database.ts";
import {
  exampleCase,
  exampleCommandRequest,
  exampleCommit,
  exampleEvent,
  exampleEvidence,
} from "./test-records.ts";

let db: TestDatabase;
let pool: Pool;
const owner = "owner_example";

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
});

afterAll(async () => {
  await db.drop();
});

async function count(table: string, caseId: string): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `select count(*) as n from ${table} where case_id = $1`,
    [caseId],
  );
  return Number(result.rows[0]?.n);
}

describe("migrations", () => {
  it("apply once; a second run has nothing to do", async () => {
    expect(await migrate(pool)).toEqual([]);
  });
});

describe("RL-04: reload restores the case from one snapshot", () => {
  it("returns the committed records, the case revision and the last sequence", async () => {
    const record = exampleCase("case_example_reload");
    expect(await createCase(pool, record, owner)).toBe(true);
    const submitted = await submitCommand(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      request: exampleCommandRequest("reload-command-0001"),
    });
    expect(submitted.status).toBe("created");
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_reload",
        expected: 1,
        upserts: [exampleEvidence(record.id, "ev_example_reload")],
      }),
    );
    expect(outcome.status).toBe("committed");
    if (outcome.status === "committed") {
      expect(Commit.safeParse(outcome.commit).success).toBe(true);
      expect(outcome.commit.events.map((e) => [e.sequence, e.caseRevision])).toEqual([[2, 2]]);
    }

    const snapshot = await readSnapshot(pool, record.id, owner);
    expect(snapshot).not.toBeNull();
    expect(CaseSnapshot.safeParse(snapshot).error?.issues ?? []).toEqual([]);
    expect(snapshot?.case.revision).toBe(2);
    expect(snapshot?.lastSequence).toBe(2);
    expect(snapshot?.records.evidenceRecords.map((e) => e.id)).toEqual(["ev_example_reload"]);
  });

  it("answers null for another owner's case, as for a missing one", async () => {
    expect(await readSnapshot(pool, "case_example_reload", "owner_example_other")).toBeNull();
    expect(await readSnapshot(pool, "case_example_missing", owner)).toBeNull();
  });

  it("returns only the latest revision of each record", async () => {
    const record = exampleCase("case_example_revisions");
    await createCase(pool, record, owner);
    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_rev1",
        expected: 1,
        upserts: [exampleEvidence(record.id, "ev_example_rev")],
      }),
    );
    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_rev2",
        expected: 2,
        upserts: [exampleEvidence(record.id, "ev_example_rev", 2)],
      }),
    );
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect(snapshot?.records.evidenceRecords.map((e) => [e.id, e.revision])).toEqual([
      ["ev_example_rev", 2],
    ]);
  });
});

describe("RL-03: events replay after a cursor with no duplicates or gaps", () => {
  it("replays in order after the cursor and ignores a repeated dedupe key", async () => {
    const record = exampleCase("case_example_replay");
    await createCase(pool, record, owner);
    const keys = ["replay-0001", "replay-0002", "replay-0003", "replay-0004", "replay-0005"];
    await appendEvents(
      pool,
      record.id,
      keys.map((k) => exampleEvent(k)),
    );
    expect((await eventsAfter(pool, record.id, 2)).map((e) => e.sequence)).toEqual([3, 4, 5]);
    const again = await appendEvents(pool, record.id, [
      exampleEvent("replay-0003"),
      exampleEvent("replay-0006"),
    ]);
    expect(again?.map((e) => [e.sequence, e.dedupeKey])).toEqual([[6, "replay-0006"]]);
    expect((await eventsAfter(pool, record.id, 0)).map((e) => e.sequence)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("keeps sequences gapless under concurrent writers", async () => {
    const record = exampleCase("case_example_concurrent");
    await createCase(pool, record, owner);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        appendEvents(pool, record.id, [exampleEvent(`concurrent-${String(i).padStart(4, "0")}`)]),
      ),
    );
    const sequences = (await eventsAfter(pool, record.id, 0)).map((e) => e.sequence);
    expect(sequences).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe("RL-05: a commit from a stale revision never overwrites newer work", () => {
  it("rebases when its inputs are unchanged, and is stale when an input changed", async () => {
    const record = exampleCase("case_example_stale");
    await createCase(pool, record, owner);
    const first = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_stale_a",
        expected: 1,
        upserts: [exampleEvidence(record.id, "ev_example_input")],
      }),
    );
    expect(first.status).toBe("committed");

    const rebased = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_stale_b",
        expected: 1,
        upserts: [exampleEvidence(record.id, "ev_example_other")],
        inputVersions: [{ entityId: "ev_example_input", revision: 1 }],
      }),
    );
    expect(rebased.status).toBe("committed");
    if (rebased.status === "committed") {
      expect(rebased.rebasedFrom).toBe(1);
      expect(rebased.commit.newCaseRevision).toBe(3);
    }

    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_stale_c",
        expected: 3,
        upserts: [exampleEvidence(record.id, "ev_example_input", 2)],
      }),
    );
    const before = await count("records", record.id);
    const stale = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_stale_d",
        expected: 2,
        upserts: [exampleEvidence(record.id, "ev_example_late")],
        inputVersions: [{ entityId: "ev_example_input", revision: 1 }],
      }),
    );
    expect(stale).toEqual({
      status: "stale",
      currentRevision: 4,
      changedInputs: [{ entityId: "ev_example_input", revision: 1 }],
    });
    expect(await count("records", record.id)).toBe(before);
  });
});

describe("AF-03 (storage part): a repeated commit writes nothing", () => {
  it("returns the earlier commit for a repeated idempotency key or result key", async () => {
    const record = exampleCase("case_example_repeat");
    await createCase(pool, record, owner);
    const proposal = exampleCommit(record, {
      id: "commit_example_repeat",
      expected: 1,
      upserts: [exampleEvidence(record.id, "ev_example_repeat")],
      resultKey: "case_example_repeat:cmd:observation_analysis:hash-0001",
    });
    expect((await applyCommit(pool, proposal)).status).toBe("committed");
    const counts = [await count("records", record.id), await count("events", record.id)];
    expect(await applyCommit(pool, proposal)).toEqual({
      status: "duplicate",
      commitId: "commit_example_repeat",
      newCaseRevision: 2,
    });
    const retried = await applyCommit(pool, {
      ...proposal,
      id: "commit_example_retry",
      idempotencyKey: "key-retry-0001",
    });
    expect(retried.status).toBe("duplicate");
    expect([await count("records", record.id), await count("events", record.id)]).toEqual(counts);
  });
});

describe("records are revised, never rewritten", () => {
  it("rejects a revision that does not follow the stored one and writes nothing", async () => {
    const record = exampleCase("case_example_rewrite");
    await createCase(pool, record, owner);
    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_rw1",
        expected: 1,
        upserts: [exampleEvidence(record.id, "ev_example_rw")],
      }),
    );
    const before = [await count("records", record.id), await count("events", record.id)];
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, {
          id: "commit_example_rw2",
          expected: 2,
          upserts: [exampleEvidence(record.id, "ev_example_rw")],
        }),
      ),
    ).rejects.toBeInstanceOf(CommitRejected);
    expect([await count("records", record.id), await count("events", record.id)]).toEqual(before);
    await expect(
      pool.query("update records set record_type = 'Brief' where case_id = $1", [record.id]),
    ).rejects.toThrow(/append-only/);
  });
});

describe("commands", () => {
  it("records the command, its outbox row and command.accepted; a repeated key returns it", async () => {
    const record = exampleCase("case_example_commands");
    await createCase(pool, record, owner);
    const request = exampleCommandRequest("commands-key-0001");
    const created = await submitCommand(pool, { caseId: record.id, ownerScopeId: owner, request });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    expect(created.command.taskIds).toHaveLength(1);
    const events = await eventsAfter(pool, record.id, 0);
    expect(events.map((e) => [e.kind, e.message, e.commandId])).toEqual([
      ["command.accepted", "Request received", created.command.id],
    ]);

    expect(await submitCommand(pool, { caseId: record.id, ownerScopeId: owner, request })).toEqual({
      status: "existing",
      command: created.command,
    });
    expect(
      await submitCommand(pool, {
        caseId: record.id,
        ownerScopeId: owner,
        request: { ...request, text: "Different text" },
      }),
    ).toEqual({ status: "key_reused" });
    expect(
      await submitCommand(pool, {
        caseId: record.id,
        ownerScopeId: "owner_example_other",
        request,
      }),
    ).toEqual({
      status: "not_found",
    });
    expect(
      await submitCommand(pool, {
        caseId: record.id,
        ownerScopeId: owner,
        request: { ...exampleCommandRequest("commands-key-0002"), expectedCaseRevision: 9 },
      }),
    ).toEqual({ status: "revision_ahead", currentRevision: 1 });

    const sent: string[] = [];
    expect(
      await dispatchOutbox(pool, (row) => {
        sent.push(row.jobKey);
        return Promise.resolve();
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(sent).toContain(`plan:${created.command.id}`);
    const resent: string[] = [];
    await dispatchOutbox(pool, (row) => {
      resent.push(row.jobKey);
      return Promise.resolve();
    });
    expect(resent).not.toContain(`plan:${created.command.id}`);
  });

  it("accepts a cancel request while running and refuses it once terminal", async () => {
    const record = exampleCase("case_example_cancel");
    await createCase(pool, record, owner);
    const created = await submitCommand(pool, {
      caseId: record.id,
      ownerScopeId: owner,
      request: exampleCommandRequest("cancel-key-0001"),
    });
    if (created.status !== "created") throw new Error(created.status);
    expect(
      (await requestCancel(pool, { commandId: created.command.id, ownerScopeId: owner })).status,
    ).toBe("requested");
    expect(await isCancelRequested(pool, created.command.id)).toBe(true);
    await setCommandStatus(pool, created.command.id, "cancelled");
    expect(
      await requestCancel(pool, { commandId: created.command.id, ownerScopeId: owner }),
    ).toEqual({ status: "terminal" });
    expect(
      await requestCancel(pool, {
        commandId: created.command.id,
        ownerScopeId: "owner_example_other",
      }),
    ).toEqual({
      status: "not_found",
    });
  });
});

describe("review decisions are never written by a task commit", () => {
  it("rejects a ReviewDecision upsert with review_not_permitted and writes nothing", async () => {
    const record = exampleCase("case_example_review_guard");
    await createCase(pool, record, owner);
    const decision: ReviewDecision = {
      recordType: "ReviewDecision",
      id: "rev_example_forged",
      revision: 1,
      createdAt: "2026-10-27T20:00:00Z",
      updatedAt: "2026-10-27T20:00:00Z",
      caseId: record.id,
      actionId: null,
      reviewedEntityVersions: [{ entityId: "act_example_plan", revision: 1 }],
      caseRevisionReviewed: 1,
      role: "scientific",
      actorId: null,
      authorityStatus: "not_established",
      mode: "demo",
      status: "approved",
      decisionAt: "2026-10-27T20:00:00Z",
      conditions: [],
      comments: "Synthetic forged approval.",
      stale: false,
    };
    const attempt = applyCommit(
      pool,
      exampleCommit(record, { id: "commit_example_forged", expected: 1, upserts: [decision] }),
    );
    await expect(attempt).rejects.toMatchObject({
      name: "CommitRejected",
      code: "review_not_permitted",
    });
    expect(await count("review_records", record.id)).toBe(0);
    expect(await count("events", record.id)).toBe(0);
  });
});

describe("a task commit may request a review and nothing more", () => {
  const request = (caseId: string, overrides: Partial<ReviewDecision> = {}): ReviewDecision => ({
    recordType: "ReviewDecision",
    id: "rev_example_request",
    revision: 1,
    createdAt: "2026-10-27T20:00:00Z",
    updatedAt: "2026-10-27T20:00:00Z",
    caseId,
    actionId: null,
    reviewedEntityVersions: [{ entityId: "ev_example_requested", revision: 1 }],
    caseRevisionReviewed: 1,
    role: "scientific",
    actorId: null,
    authorityStatus: "not_established",
    mode: "demo",
    status: "requested",
    decisionAt: null,
    conditions: [],
    comments: "Synthetic review request.",
    stale: false,
    ...overrides,
  });

  it("stores a review request in review_records", async () => {
    const record = exampleCase("case_example_review_request");
    await createCase(pool, record, owner);
    const outcome = await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_request",
        expected: 1,
        upserts: [request(record.id)],
      }),
    );
    expect(outcome.status).toBe("committed");
    const snapshot = await readSnapshot(pool, record.id, owner);
    expect(snapshot?.records.reviewDecisionRecords.map((d) => [d.id, d.status])).toEqual([
      ["rev_example_request", "requested"],
    ]);
  });

  it.each([
    ["an approval", { status: "approved" as const, decisionAt: "2026-10-27T20:00:00Z" }],
    ["a request with an actor", { actorId: "actor_example" }],
    ["a request with conditions", { conditions: ["Synthetic condition"] }],
    ["a request claiming authority", { authorityStatus: "verified_for_scope" as const }],
    ["a request in real mode", { mode: "real" as const }],
  ])("refuses %s with review_not_permitted", async (_name, overrides) => {
    const record = exampleCase(`case_example_rq_${String(Math.random()).slice(2, 8)}`);
    await createCase(pool, record, owner);
    await expect(
      applyCommit(
        pool,
        exampleCommit(record, {
          id: "commit_example_rq",
          expected: 1,
          upserts: [request(record.id, overrides)],
        }),
      ),
    ).rejects.toMatchObject({ code: "review_not_permitted" });
  });
});

describe("the record and event history is append-only", () => {
  it("refuses DELETE and TRUNCATE on records, events, case revisions and review records", async () => {
    const record = exampleCase("case_example_no_delete");
    await createCase(pool, record, owner);
    await applyCommit(
      pool,
      exampleCommit(record, {
        id: "commit_example_nd",
        expected: 1,
        upserts: [exampleEvidence(record.id, "ev_example_nd")],
      }),
    );
    for (const table of ["records", "events", "case_revisions"]) {
      await expect(
        pool.query(`delete from ${table} where case_id = $1`, [record.id]),
      ).rejects.toThrow(/DELETE on .* is refused/);
    }
    for (const table of ["records", "events", "case_revisions", "review_records"]) {
      await expect(pool.query(`truncate ${table} cascade`)).rejects.toThrow(
        /TRUNCATE on .* is refused/,
      );
    }
    await expect(pool.query("delete from cases where id = $1", [record.id])).rejects.toThrow(
      /DELETE on .* is refused/,
    );
    expect(await count("records", record.id)).toBe(1);
  });

  it("refuses a direct DELETE of one event even with the deletion setting on", async () => {
    const record = exampleCase("case_example_flag_probe");
    await createCase(pool, record, owner);
    await appendEvents(pool, record.id, [
      exampleEvent("flag-probe-0001"),
      exampleEvent("flag-probe-0002"),
    ]);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local siterra.case_deletion = 'on'");
      await expect(
        client.query("delete from events where case_id = $1 and sequence = 1", [record.id]),
      ).rejects.toThrow(/DELETE on events is refused/);
      await client.query("rollback");
    } finally {
      client.release();
    }
    expect((await eventsAfter(pool, record.id, 0)).map((e) => e.sequence)).toEqual([1, 2]);
  });

  it("allows deleting a whole case only on the flagged path", async () => {
    const record = exampleCase("case_example_delete_path");
    await createCase(pool, record, owner);
    await appendEvents(pool, record.id, [exampleEvent("delete-path-0001")]);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local siterra.case_deletion = 'on'");
      await client.query("delete from cases where id = $1", [record.id]);
      await client.query("commit");
    } finally {
      client.release();
    }
    expect(await count("events", record.id)).toBe(0);
  });
});
