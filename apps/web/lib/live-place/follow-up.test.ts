import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseSnapshot, Task } from "@siterra/contracts";
import { CommitProposal, EventDraft } from "@siterra/db";
import { describe, expect, it } from "vitest";
import { isAskTaskId } from "../ask/task.ts";
import {
  type ModelCall,
  commandCompletedEvent,
  commandHash,
  followUpCommit,
  followUpEvents,
  followUpTask,
  followUpTaskId,
  noAnswerCode,
  observedFetch,
} from "./follow-up.ts";

const NOW = "2026-11-03T10:00:00.000Z";
const CASE_ID = "case_follow_up_test";
const COMMAND_ID = "cmd_follow_up_test";
const HASH = commandHash(COMMAND_ID);
const TASK_ID = followUpTaskId(HASH);

const seed = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      ...["..", "..", "..", "..", "packages", "contracts", "fixtures"],
      "case-snapshot-aitbouguemez-seed.json",
    ),
    "utf8",
  ),
) as CaseSnapshot;

// the records two chosen findings are built from, in the answer's order: a view's spec and a gap a check settles
const CHOSEN = [
  { entityId: "inst_rainfall_scatter_valley", revision: 1 },
  { entityId: "ev_synthetic_need_herd_records", revision: 1 },
];

const taskOf = (over: Partial<Parameters<typeof followUpTask>[0]> = {}) =>
  Task.parse(
    followUpTask({
      caseId: CASE_ID,
      commandId: COMMAND_ID,
      question: "Does wet-season rainfall explain the greening?",
      taskId: TASK_ID,
      hash: HASH,
      startedAt: NOW,
      now: NOW,
      status: "succeeded",
      failureCode: null,
      chosen: CHOSEN,
      ...over,
    }),
  );

describe("the follow-up's task", () => {
  it("is the question's one task, named by its command, and the steps know it by its id", () => {
    expect(TASK_ID).toBe(`task_ask_${HASH}`);
    expect(HASH).toMatch(/^[0-9a-f]{6}$/);
    expect(isAskTaskId(TASK_ID)).toBe(true);
  });

  it("names the chosen findings' records as what its answer rests on, in the answer's order, and writes none", () => {
    expect(taskOf()).toMatchObject({
      kind: "source_research",
      question: "Does wet-season rainfall explain the greening?",
      status: "succeeded",
      inputVersions: CHOSEN,
      allowedTools: ["read_case", "read_evidence"],
      outputEntityIds: [],
      maxModelRounds: 1,
      failureCode: null,
    });
    // a record named twice is named once, where it was first named
    expect(taskOf({ chosen: [...CHOSEN, ...CHOSEN.slice(0, 1)] }).inputVersions).toEqual(CHOSEN);
  });

  it("records a failure with its cause", () => {
    expect(taskOf({ status: "failed", failureCode: "http_503", chosen: [] })).toMatchObject({
      status: "failed",
      failureCode: "http_503",
      inputVersions: [],
    });
  });
});

describe("the model call as its transport reported it", () => {
  it("names why no usable answer came back", async () => {
    const answered = observedFetch(() => Promise.resolve(new Response("{}", { status: 503 })));
    await answered.fetch("https://model.invalid/v1/responses");
    expect(answered.report()).toEqual({ httpStatus: 503, error: null });
    expect(noAnswerCode(answered.report())).toBe("http_503");

    const abort = new Error("aborted");
    abort.name = "AbortError";
    const timedOut = observedFetch(() => Promise.reject(abort));
    await expect(timedOut.fetch("https://model.invalid/v1/responses")).rejects.toBe(abort);
    expect(noAnswerCode(timedOut.report())).toBe("model_timeout");

    expect(noAnswerCode({ httpStatus: null, error: "TypeError" })).toBe("model_unreachable");
    expect(noAnswerCode({ httpStatus: 200, error: null })).toBe("reply_unreadable");
  });
});

describe("the events of a follow-up", () => {
  const call: ModelCall = {
    model: "muse-spark-1.3",
    startedAt: NOW,
    endedAt: NOW,
    durationMs: 1200,
    answered: false,
    transport: { httpStatus: 503, error: null },
  };
  const base = {
    commandId: COMMAND_ID,
    taskId: TASK_ID,
    placeName: "Imlil",
    startedAt: NOW,
    now: NOW,
  };

  it("says what the task did in host words, with the model call and no price it was not given", () => {
    const drafts = followUpEvents({
      ...base,
      status: "failed",
      failureCode: "http_503",
      call,
      chosen: 0,
    }).map((d) => EventDraft.parse(d));
    expect(drafts.map((d) => [d.kind, d.message])).toEqual([
      ["task.started", "Reading the case's findings for Imlil."],
      ["model.started", "Model call to muse-spark-1.3 (Model API) started."],
      ["model.completed", "Model call to muse-spark-1.3 (Model API) failed with http_503."],
      ["case.committed", "Committed the question's task for Imlil."],
      ["task.failed", "Source research task failed: http_503."],
    ]);
    expect(drafts[2]?.usage).toMatchObject({
      provider: "meta_model_api",
      status: "failed",
      durationMs: 1200,
      inputTokens: null,
      estimatedCostMicroUsd: null,
    });
    expect(drafts.at(-1)?.resultStatus).toBe("failed");
    expect(
      EventDraft.parse(commandCompletedEvent(COMMAND_ID, "failed", [TASK_ID], NOW)),
    ).toMatchObject({
      kind: "command.completed",
      resultStatus: "failed",
      entityIds: [COMMAND_ID, TASK_ID],
    });
  });

  it("commits only its task, and counts the findings its answer rests on, or says it found none", () => {
    const answered = { ...call, answered: true, transport: { httpStatus: 200, error: null } };
    const two = followUpEvents({
      ...base,
      status: "succeeded",
      failureCode: null,
      call: answered,
      chosen: 2,
    });
    expect(two.find((d) => d.kind === "case.committed")?.entityIds).toEqual([TASK_ID]);
    expect(two.find((d) => d.kind === "model.completed")?.usage?.status).toBe("succeeded");
    expect(two.at(-1)?.message).toBe("Source research task chose 2 findings of the case.");
    const none = followUpEvents({
      ...base,
      status: "succeeded",
      failureCode: null,
      call: answered,
      chosen: 0,
    });
    expect(none.at(-1)?.message).toBe(
      "Source research task found no finding of the case that answers the question.",
    );
  });

  it("writes no model events when the task ended before calling the model", () => {
    const kinds = followUpEvents({
      ...base,
      status: "failed",
      failureCode: "model_not_configured",
      call: null,
      chosen: 0,
    }).map((d) => d.kind);
    expect(kinds).toEqual(["case.committed", "task.failed"]);
  });
});

describe("the follow-up's commit", () => {
  it("is proposed at the revision it read, resting on the chosen records, leaving the case's fields as they were", () => {
    const task = taskOf({ caseId: seed.case.id });
    const commit = CommitProposal.parse(
      followUpCommit({
        id: "commit_follow_up_test",
        caseRecord: seed.case,
        commandId: COMMAND_ID,
        taskId: TASK_ID,
        now: NOW,
        inputVersions: task.inputVersions,
        upserts: [task],
        events: followUpEvents({
          commandId: COMMAND_ID,
          taskId: TASK_ID,
          placeName: "Imlil",
          startedAt: NOW,
          now: NOW,
          status: "succeeded",
          failureCode: null,
          call: null,
          chosen: CHOSEN.length,
        }),
      }),
    );
    expect(commit).toMatchObject({
      expectedCaseRevision: seed.case.revision,
      newCaseRevision: seed.case.revision + 1,
      inputVersions: CHOSEN,
      upserts: [task],
      caseAfter: { ...seed.case, revision: seed.case.revision + 1, updatedAt: NOW },
    });
  });
});
