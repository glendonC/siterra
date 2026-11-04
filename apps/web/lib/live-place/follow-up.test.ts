import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseSnapshot, Evidence, Source, Task } from "@siterra/contracts";
import { CommitProposal, EventDraft } from "@siterra/db";
import { describe, expect, it } from "vitest";
import {
  type ModelCall,
  commandCompletedEvent,
  commandHash,
  followUpCommit,
  followUpEvents,
  followUpTask,
  followUpTaskId,
  noAnswerCode,
  numbersNotInExcerpt,
  observedFetch,
  verifiedFindingEvidence,
} from "./follow-up.ts";
import type { LlmVerifiedFinding } from "./llm-schema-and-prompt.ts";

const NOW = "2026-11-03T10:00:00.000Z";
const CASE_ID = "case_follow_up_test";
const COMMAND_ID = "cmd_follow_up_test";
const HASH = commandHash(COMMAND_ID);
const TASK_ID = followUpTaskId(HASH);
const CTX = {
  caseId: CASE_ID,
  geoSelectionId: "geo_follow_up_test",
  taskId: TASK_ID,
  hash: HASH,
  now: NOW,
};

const seed = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "..",
      "packages",
      "contracts",
      "fixtures",
      "case-snapshot-aitbouguemez-seed.json",
    ),
    "utf8",
  ),
) as CaseSnapshot;
const SCI03 = seed.records.sourceRecords.find((s) => s.id === "src_SCI-03") as Source;

// a retrieved source whose notes hold its abstract, at a revision other than 1
const ABSTRACT =
  "Upper pastures above 2317 m lost palatable perennial grasses between 2010 and 2020 where grazing pressure rose.";
const AGDAL = Source.parse({
  ...SCI03,
  id: "src_agdal_follow_up_1",
  revision: 3,
  title: "Agdal pastures and grazing pressure in the Central High Atlas",
  notes: [ABSTRACT],
});

const finding = (f: Partial<LlmVerifiedFinding>): LlmVerifiedFinding => ({
  statement: ABSTRACT,
  sourceId: AGDAL.id,
  exactQuote: ABSTRACT,
  interpretation: "Grazing is the main driver of the change.",
  ...f,
});

describe("the findings a follow-up keeps from the model", () => {
  it("stores nothing for the probe: a title fragment as the excerpt and numbers the excerpt lacks", () => {
    const probe = {
      statement:
        "Grazing pressure on the upper slopes doubled between 2010 and 2023, removing 45% of palatable cover.",
      sourceId: "src_SCI-03",
      exactQuote: SCI03.title.slice(0, 40),
      interpretation: "Grazing is the main driver of the change.",
    };
    expect(verifiedFindingEvidence([probe], [SCI03], CTX)).toEqual([]);
    // with an excerpt that is in the notes, the statement still holds 2010, 2023 and 45 that the excerpt lacks
    const inNotes = { ...probe, exactQuote: SCI03.notes[0] ?? "" };
    expect(numbersNotInExcerpt(probe.statement, inNotes.exactQuote)).toEqual([
      "2010",
      "2023",
      "45%",
    ]);
    expect(verifiedFindingEvidence([inNotes], [SCI03], CTX)).toEqual([]);
  });

  it("refuses a statement with any number its excerpt lacks, dates included", () => {
    expect(numbersNotInExcerpt("Grasses declined above 2,317 m after 2010.", ABSTRACT)).toEqual([]);
    expect(numbersNotInExcerpt("Grasses declined in 2010-04.", ABSTRACT)).toEqual(["04"]);
    const refused = finding({ statement: "Palatable grasses fell by 30% above 2317 m." });
    expect(verifiedFindingEvidence([refused], [AGDAL], CTX)).toEqual([]);
  });

  it("keeps a paraphrase as provisional and unverified, with no interpretation and the source's own revision", () => {
    const [ev] = verifiedFindingEvidence(
      [finding({ statement: "Grazing pressure rose on the upper pastures above 2317 m." })],
      [AGDAL],
      CTX,
    );
    expect(Evidence.parse(ev)).toMatchObject({
      id: `ev_llm_${HASH}_1`,
      claimKind: "scientific_context",
      status: "provisional",
      interpretation: null,
      provenance: {
        verificationStatus: "unverified",
        generatedByTaskId: TASK_ID,
        inputVersions: [{ entityId: AGDAL.id, revision: 3 }],
        sourceLocators: [{ sourceId: AGDAL.id, locator: "verified excerpt", excerpt: ABSTRACT }],
      },
    });
  });

  it("accepts as source-checked only a statement quoted word for word from its excerpt", () => {
    const [ev] = verifiedFindingEvidence(
      [finding({ statement: "upper pastures above 2317 m lost palatable perennial grasses" })],
      [AGDAL],
      CTX,
    );
    expect(Evidence.parse(ev)).toMatchObject({
      status: "accepted",
      interpretation: null,
      provenance: { verificationStatus: "source_checked" },
    });
  });

  it("drops a finding whose source the model was not given, or whose excerpt is not in the source's notes", () => {
    expect(verifiedFindingEvidence([finding({ sourceId: "src_not_given" })], [AGDAL], CTX)).toEqual(
      [],
    );
    expect(verifiedFindingEvidence([finding({ exactQuote: AGDAL.title })], [AGDAL], CTX)).toEqual(
      [],
    );
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
    expect(noAnswerCode({ httpStatus: 200, error: null })).toBe("validation_rejected");
  });
});

describe("the records and events of a follow-up", () => {
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
    liveSearch: false,
    startedAt: NOW,
    now: NOW,
  };

  it("records a failed task with its cause, and the model call with no price it was not given", () => {
    const task = Task.parse(
      followUpTask({
        caseId: CASE_ID,
        commandId: COMMAND_ID,
        question: "Why did the upper slopes stay green in 2023?",
        taskId: TASK_ID,
        hash: HASH,
        startedAt: NOW,
        now: NOW,
        status: "failed",
        failureCode: "http_503",
        evidenceIds: [],
        inputVersions: [],
      }),
    );
    expect(task).toMatchObject({
      kind: "source_research",
      status: "failed",
      failureCode: "http_503",
    });

    const drafts = followUpEvents({
      ...base,
      status: "failed",
      failureCode: "http_503",
      call,
      sourceIds: [],
      acceptedIds: [],
      provisionalIds: [],
    }).map((d) => EventDraft.parse(d));
    expect(drafts.map((d) => [d.kind, d.message])).toEqual([
      ["task.started", "Reading the case's stored sources for Imlil."],
      ["model.started", "Model call to muse-spark-1.3 (Model API) started."],
      ["model.completed", "Model call to muse-spark-1.3 (Model API) failed with http_503."],
      ["case.committed", "Committed 0 sources and 0 evidence records for Imlil."],
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

  it("lists only its own records, and counts accepted items apart from provisional paraphrases", () => {
    const drafts = followUpEvents({
      ...base,
      status: "succeeded",
      failureCode: null,
      call: { ...call, answered: true, transport: { httpStatus: 200, error: null } },
      sourceIds: ["src_oa_abc123_1"],
      acceptedIds: ["ev_gov_abc123_1"],
      provisionalIds: ["ev_llm_abc123_1", "ev_llm_abc123_2"],
    }).map((d) => EventDraft.parse(d));
    const committed = drafts.find((d) => d.kind === "case.committed");
    expect(committed?.entityIds).toEqual([
      "src_oa_abc123_1",
      "ev_gov_abc123_1",
      "ev_llm_abc123_1",
      "ev_llm_abc123_2",
      TASK_ID,
    ]);
    expect(drafts.find((d) => d.kind === "model.completed")?.usage?.status).toBe("succeeded");
    expect(drafts.at(-1)?.message).toBe(
      "Source research task accepted 1 item and kept 2 paraphrases as provisional.",
    );
  });

  it("writes no model events when the task ended before calling the model", () => {
    const kinds = followUpEvents({
      ...base,
      status: "failed",
      failureCode: "model_not_configured",
      call: null,
      sourceIds: [],
      acceptedIds: [],
      provisionalIds: [],
    }).map((d) => d.kind);
    expect(kinds).toEqual(["case.committed", "task.failed"]);
  });

  it("proposes one commit at the revision it read, leaving the case's fields as they were", () => {
    const task = followUpTask({
      caseId: seed.case.id,
      commandId: COMMAND_ID,
      question: "q",
      taskId: TASK_ID,
      hash: HASH,
      startedAt: NOW,
      now: NOW,
      status: "succeeded",
      failureCode: null,
      evidenceIds: [],
      inputVersions: [
        { entityId: "src_SCI-03", revision: 1 },
        { entityId: "src_SCI-03", revision: 1 },
      ],
    });
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
          ...base,
          status: "succeeded",
          failureCode: null,
          call: null,
          sourceIds: [],
          acceptedIds: [],
          provisionalIds: [],
        }),
      }),
    );
    expect(task.inputVersions).toEqual([{ entityId: "src_SCI-03", revision: 1 }]);
    expect(commit).toMatchObject({
      expectedCaseRevision: seed.case.revision,
      newCaseRevision: seed.case.revision + 1,
      inputVersions: [{ entityId: "src_SCI-03", revision: 1 }],
      caseAfter: { ...seed.case, revision: seed.case.revision + 1, updatedAt: NOW },
    });
  });
});
