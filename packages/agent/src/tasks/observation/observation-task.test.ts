import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../../model/adapter.ts";
import type { ReplayStep } from "../../model/replay.ts";
import { strictSubsetIssues } from "../../model/strict-schema.ts";
import { AT, CASE_ID, queuedTask, testStore } from "../../testing/case-fixture.ts";
import { answerStep, syntheticTransport, toolCallStep } from "../../testing/replay-steps.ts";
import { caseToolRegistry } from "../../tools/registry.ts";
import { MemoryCommitApi } from "../commit.ts";
import { evidenceOutputSchema } from "../evidence/proposal.ts";
import type { EvidenceRecord, TaskRecord } from "../records.ts";
import type { TraceEventDraft } from "../trace.ts";
import { runObservationTask } from "./observation-task.ts";

// Synthetic replays over a synthetic case. The commit goes through MemoryCommitApi, the test
// double of PLATFORM's commit transaction; the PostgreSQL path is not exercised here.

const SUMMARIZE = toolCallStep("summarize_observations", {
  bundleId: "bundle_test_ndvi",
  bundleRevision: 2,
  periodIds: ["period_2022-03", "period_2022-04", "period_2022-05"],
  metric: "ndvi_area_median",
});

function item(statement: string, measurementIds: string[], claimKind = "observation") {
  return {
    statement,
    claimKind,
    measurementIds,
    sourceId: null,
    locator: null,
    excerpt: null,
    scopeNote: "",
    limitations: [],
  };
}

const GOOD = {
  items: [
    item("The catchment NDVI area median was 0.1439 in April 2022, with snow suspected.", [
      "meas_test_2022-04",
    ]),
    item("May 2022 has no value: too little of the catchment had clear dates.", [
      "meas_test_2022-05",
    ]),
  ],
};

function harness(steps: ReplayStep[]) {
  const store = testStore();
  const events: TraceEventDraft[] = [];
  let n = 0;
  return {
    store,
    events,
    deps: {
      adapter: new MetaAdapter({
        transport: syntheticTransport(steps),
        sleep: () => Promise.resolve(),
      }),
      trace: { emit: (e: TraceEventDraft) => events.push(e) },
      store,
      tools: caseToolRegistry(store, CASE_ID),
      newEvidenceId: () => `ev_test_${String((n += 1)).padStart(2, "0")}`,
      now: () => AT,
    },
  };
}

describe("observation task, synthetic replay, memory commit", () => {
  it("summarize_observations to validated evidence to commit, with lineage (TR-01 path)", async () => {
    const { deps, events } = harness([SUMMARIZE, answerStep(JSON.stringify(GOOD))]);
    const { loop, commit } = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("accepted");
    expect(loop.validation?.outcome).toBe("accepted");

    const api = new MemoryCommitApi(3);
    const outcome = await api.commit(commit);
    expect(outcome).toMatchObject({ status: "committed", newCaseRevision: 4 });

    const task = api.tasks.get("task_test_observations") as TaskRecord;
    expect(task).toMatchObject({
      status: "succeeded",
      revision: 2,
      outputEntityIds: ["ev_test_01", "ev_test_02"],
    });
    const evidence = api.evidence.get("ev_test_01") as EvidenceRecord;
    expect(evidence).toMatchObject({
      claimKind: "observation",
      status: "accepted",
      geoSelectionId: "geo_test_catchment",
      periodIds: ["period_2022-04"],
      measurementIds: ["meas_test_2022-04"],
    });
    expect(evidence.provenance).toMatchObject({
      dataBundleIds: ["bundle_test_ndvi"],
      methodId: "test_ndvi_monthly",
      methodVersion: "0.1.0",
      generatedByTaskId: "task_test_observations",
      verificationStatus: "computed_checked",
      inputVersions: [
        { entityId: "meas_test_2022-04", revision: 1 },
        { entityId: "bundle_test_ndvi", revision: 2 },
      ],
    });
    expect(evidence.provenance.limitations).toContain(
      "The spatial IQR is variability across pixels, not a confidence interval.",
    );

    const tool = events.find((e) => e.kind === "tool.completed")?.tool;
    expect(tool).toMatchObject({
      name: "summarize_observations",
      status: "succeeded",
      resultEntityIds: ["meas_test_2022-03", "meas_test_2022-04", "meas_test_2022-05"],
    });
    expect(api.events.map((e) => e.kind)).toEqual(["task.succeeded"]);
  });

  it("a number the measurements do not hold is rejected, then repaired", async () => {
    const invented = {
      items: [
        item("NDVI rose by 0.0228 from March to April 2022.", [
          "meas_test_2022-03",
          "meas_test_2022-04",
        ]),
      ],
    };
    const { deps } = harness([
      SUMMARIZE,
      answerStep(JSON.stringify(invented)),
      answerStep(JSON.stringify(GOOD)),
    ]);
    const { loop } = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.repaired).toBe(true);
    expect(loop.status).toBe("accepted");
  });

  it("keeps the valid items of a partial result and lists the rest", async () => {
    const mixed = {
      items: [
        GOOD.items[0],
        item("Overgrazing was detected in April 2022.", ["meas_test_2022-04"]),
        item("Restoration has worked.", [], "verified_outcome"),
        item("Unknown measurement.", ["meas_test_missing"]),
      ],
    };
    const { deps } = harness([SUMMARIZE, answerStep(JSON.stringify(mixed))]);
    const { loop, commit } = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.validation?.outcome).toBe("partial");
    expect(loop.validation?.issues.map((i) => i.code)).toEqual([
      "prohibited_claim",
      "claim_kind",
      "unknown_reference",
    ]);
    expect(commit.upserts.filter((r) => r.recordType === "Evidence")).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({ status: "partial" });
    expect(commit.events[0]?.kind).toBe("task.partial");
  });

  it("an observation without measurements is rejected", async () => {
    const bare = { items: [item("NDVI was low.", [])] };
    const { deps } = harness([answerStep(JSON.stringify(bare)), answerStep(JSON.stringify(bare))]);
    const { loop, commit } = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 3 },
      deps,
    );
    expect(loop.status).toBe("rejected");
    expect(loop.validation?.issues[0]).toMatchObject({
      code: "claim_kind",
      path: "$.items[0].measurementIds",
    });
    expect(commit.upserts).toHaveLength(1);
    expect(commit.upserts[0]).toMatchObject({
      status: "failed",
      failureCode: "validation_rejected",
    });
  });

  it("a stale case revision commits nothing, and a repeated commit is a duplicate", async () => {
    const { deps } = harness([SUMMARIZE, answerStep(JSON.stringify(GOOD))]);
    const { commit } = await runObservationTask(
      { task: queuedTask(), expectedCaseRevision: 3 },
      deps,
    );
    const behind = new MemoryCommitApi(5);
    expect(await behind.commit(commit)).toEqual({ status: "stale", currentCaseRevision: 5 });
    expect(behind.evidence.size).toBe(0);
    const api = new MemoryCommitApi(3);
    await api.commit(commit);
    expect(await api.commit(commit)).toMatchObject({ status: "duplicate", newCaseRevision: 4 });
    expect(api.caseRevision).toBe(4);
  });

  it("the evidence output schema fits the strict subset", () => {
    expect(strictSubsetIssues(evidenceOutputSchema())).toEqual([]);
  });
});
