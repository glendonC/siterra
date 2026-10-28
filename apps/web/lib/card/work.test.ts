import { CaseSnapshot, type Event } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { appendEvents, EMPTY_LOG } from "../case/events";
import { countWords, LIMITS } from "../budget/measure";
import { projectObservations } from "../projection/observations";
import { cardLines } from "./content";
import { commandRunning, requestOutcome, workCard } from "./work";

const snapshot = CaseSnapshot.parse(seed);
const NDVI = "bundle_s2_ndvi_monthly_ait_bouguemez";
const NDVI_LINE =
  "Catchment NDVI, Sentinel-2 monthly: 68 of 84 months observed, Jan 2019 to Dec 2025";
const RAIN_LINE =
  "Catchment rainfall, CHIRPS v3.0 monthly: 84 of 84 months observed, Jan 2019 to Dec 2025";

// synthetic records and events for the shape only
const accepted = {
  sequence: 2,
  kind: "command.accepted",
  commandId: "cmd_a",
  message: "Request received",
} as unknown as Event;
const log = appendEvents(EMPTY_LOG, [accepted]);

type Status = "running" | "succeeded" | "partial" | "failed" | "cancelled" | "awaiting_input";
const taskRecord = (
  id: string,
  status: Status,
  question: string,
  kind = "observation_analysis",
  failureCode: string | null = null,
) => ({
  id,
  commandId: "cmd_b",
  kind,
  status,
  question,
  failureCode,
  createdAt: `2026-10-27T20:00:0${id.slice(-1)}Z`,
});
const evidence = (id: string, taskId: string, measurementIds: string[], status = "accepted") => ({
  id,
  revision: 1,
  claimKind: "observation",
  status,
  measurementIds,
  provenance: { dataBundleIds: [], generatedByTaskId: taskId },
});
const withRecords = (
  tasks: ReturnType<typeof taskRecord>[],
  evidenceRecords: ReturnType<typeof evidence>[] = [],
) =>
  ({
    ...snapshot,
    records: { ...snapshot.records, taskRecords: tasks, evidenceRecords },
  }) as unknown as CaseSnapshot;
const ev = (sequence: number, kind: string, resultStatus: string | null = null) =>
  ({ sequence, kind, commandId: "cmd_b", message: kind, resultStatus }) as unknown as Event;
const words = (c: ReturnType<typeof workCard>) =>
  cardLines(c).reduce((n, l) => n + countWords(l), 0);
const runLog = appendEvents(EMPTY_LOG, [ev(2, "command.accepted")]);
const ended = (status: string) => appendEvents(runLog, [ev(9, "command.completed", status)]);
const card = (s: CaseSnapshot, l = runLog) => workCard(s, l, "cmd_b", projectObservations(s));
const ndviMeasurement = "meas_s2_ndvi_monthly_ait_bouguemez_2022-04_ndvi_area_median";

describe("workCard", () => {
  const c = workCard(snapshot, log, "cmd_a", projectObservations(snapshot));

  it("asks the case question and says what the request is doing from its events", () => {
    expect(c.question).toBe(snapshot.case.objective);
    expect(c.working).toBe("Request received");
  });

  it("does not list the case's precomputed bundles as the result of a request that has produced nothing", () => {
    expect(c.section).toBeUndefined();
  });
});

describe("workCard as the command runs and completes", () => {
  const steps = (status: Status) => [
    taskRecord("task_1", status, "What did catchment NDVI show in spring 2022?"),
    taskRecord("task_2", status, "What did catchment rainfall show in spring 2022?"),
  ];

  it("shows the steps while they run, and the Observations once the request completes", () => {
    const r = card(withRecords(steps("running")));
    expect(r.steps?.map((s) => s.text)).toEqual([
      "What did catchment NDVI show in spring 2022?",
      "What did catchment rainfall show in spring 2022?",
    ]);
    expect(r.section).toBeUndefined();
    expect(words(r)).toBeLessThanOrEqual(LIMITS.cardWords);

    const done = withRecords(steps("succeeded"), [
      evidence("ev_1", "task_1", [ndviMeasurement]),
      evidence("ev_2", "task_2", [
        "meas_chirps_monthly_ait_bouguemez_2022-04_precipitation_catchment_total",
      ]),
    ]);
    const d = card(done, ended("succeeded"));
    expect(d.working).toBe("Request complete");
    expect(d.steps).toBeUndefined();
    expect(d.section?.heading).toBe("Precomputed observations");
    expect(d.section?.lines).toEqual([RAIN_LINE, NDVI_LINE]);
    expect(d.recordIds).toEqual(
      expect.arrayContaining([
        "cmd_b",
        "ev_1",
        "ev_2",
        NDVI,
        "bundle_chirps_monthly_ait_bouguemez",
      ]),
    );
    expect(words(d)).toBeLessThanOrEqual(LIMITS.cardWords);
  });

  it("says the request failed, with its cause, and shows no Observations when no task produced evidence", () => {
    const failed = withRecords([
      taskRecord("task_1", "failed", "q1", "observation_analysis", "round_limit"),
      taskRecord("task_2", "failed", "q2", "hypothesis_comparison", "dependency_failed"),
    ]);
    for (const l of [ended("failed"), appendEvents(runLog, [ev(9, "task.failed")])]) {
      const f = card(failed, l);
      expect(f.working).toBe(
        "Request failed: stopped at the model round limit. Your question is kept.",
      );
      expect(f.section).toBeUndefined();
      expect(f.steps).toBeUndefined();
      expect(words(f)).toBeLessThanOrEqual(LIMITS.cardWords);
    }
  });

  it("never reads a failed command as complete, with or without task records", () => {
    const f = card(withRecords([]), ended("failed"));
    expect(f.working).toBe("Request failed: no step finished. Your question is kept.");
    const e = card(
      withRecords([taskRecord("task_1", "failed", "q1", "plan", "executor_error")]),
      ended("failed"),
    );
    expect(e.working).toBe("Request failed: no step finished. Your question is kept.");
  });

  it("says what was not done when the request finishes with gaps, and lists only what this request observed", () => {
    const partial = withRecords(
      [
        taskRecord("task_1", "succeeded", "q1"),
        taskRecord("task_2", "failed", "q2", "source_research", "round_limit"),
      ],
      [
        evidence("ev_1", "task_1", [ndviMeasurement]),
        evidence("ev_9", "task_9", [
          "meas_chirps_monthly_ait_bouguemez_2022-04_precipitation_catchment_total",
        ]),
        evidence("ev_3", "task_1", [ndviMeasurement], "rejected"),
      ],
    );
    const p = card(partial, ended("partial"));
    expect(p.working).toBe("Finished with gaps. Not done: source research.");
    expect(p.section?.lines).toEqual([NDVI_LINE]);
    expect(p.recordIds).not.toContain("ev_9");
    expect(p.recordIds).not.toContain("ev_3");
    expect(words(p)).toBeLessThanOrEqual(LIMITS.cardWords);
  });

  it("says the request was canceled", () => {
    const c = card(
      withRecords([taskRecord("task_1", "cancelled", "q1")]),
      appendEvents(runLog, [ev(9, "task.cancelled")]),
    );
    expect(c.working).toBe("Request canceled");
    expect(c.section).toBeUndefined();
  });
});

describe("requestOutcome", () => {
  it("takes the command's recorded result first", () => {
    for (const s of ["succeeded", "partial", "failed", "cancelled"])
      expect(requestOutcome(withRecords([]), ended(s), "cmd_b")).toBe(s);
  });

  it("derives it from the tasks as the coordinator does when no result is recorded", () => {
    const of = (...st: Status[]) =>
      requestOutcome(
        withRecords(st.map((s, i) => taskRecord(`task_${i + 1}`, s, `q${i}`))),
        runLog,
        "cmd_b",
      );
    expect(of("running", "succeeded")).toBe("running");
    expect(of("awaiting_input", "succeeded")).toBe("running");
    expect(of("succeeded", "succeeded")).toBe("succeeded");
    expect(of("succeeded", "failed")).toBe("partial");
    expect(of("partial")).toBe("partial");
    expect(of("failed", "failed")).toBe("failed");
    expect(requestOutcome(withRecords([]), runLog, "cmd_b")).toBe("running");
  });
});

describe("commandRunning", () => {
  it("runs until the command completes", () => {
    expect(commandRunning(snapshot, log, "cmd_a")).toBe(true);
    const done = appendEvents(log, [
      {
        sequence: 3,
        kind: "command.completed",
        commandId: "cmd_a",
        message: "done",
      } as unknown as Event,
    ]);
    expect(commandRunning(snapshot, done, "cmd_a")).toBe(false);
  });
});
