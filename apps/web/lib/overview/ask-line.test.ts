import type { CaseSnapshot, Event, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import type { EventLog } from "../case/events";
import { ak } from "../copy/ask";
import { en } from "../copy/en";
import { seed } from "../instruments/seed-listing";
import {
  askLine,
  askStatus,
  failedLine,
  refusedLine,
  shouldReopen,
  type AskLineInput,
  type AskStatusInput,
} from "./ask-line";

// events and tasks in the shapes the worker writes on the replay route, for the rules only
let seq = 0;
const ev = (kind: Event["kind"], taskId: string | null, message: string, extra = {}) =>
  ({
    sequence: ++seq,
    kind,
    commandId: "cmd_a",
    taskId,
    message,
    resultStatus: null,
    tool: null,
    usage: null,
    validation: null,
    ...extra,
  }) as unknown as Event;
const usage = {
  provider: "replay",
  model: "muse-spark-1.3",
  status: "succeeded",
  replayOrigin: "synthetic",
};
const task = (id: string, kind: Task["kind"], status: Task["status"], extra = {}) =>
  ({
    id,
    commandId: "cmd_a",
    kind,
    status,
    question: `Question of ${id}`,
    failureCode: null,
    missingInputs: [],
    createdAt: `2026-10-28T18:00:0${id.slice(-1)}Z`,
    ...extra,
  }) as unknown as Task;
const withTasks = (tasks: Task[]): CaseSnapshot => ({
  ...seed,
  records: { ...seed.records, taskRecords: tasks },
});
const logOf = (events: Event[]): EventLog => ({
  events,
  lastSequence: events.at(-1)?.sequence ?? 0,
});
const base = { sent: true, notice: null, pacing: false } as const;
const line = (input: AskLineInput) => askLine(input)?.text ?? null;

describe("the ask's activity line", () => {
  it("shows nothing before Enter, and the catalog's refusal when the server refuses", () => {
    const s = withTasks([]);
    expect(line({ ...base, snapshot: s, log: logOf([]), commandId: null, sent: false })).toBe(null);
    expect(
      line({ ...base, snapshot: s, log: logOf([]), commandId: null, notice: "work.quotaUsed" }),
    ).toBe("Demo request limit reached for this session. Question text kept.");
    expect(line({ ...base, snapshot: s, log: logOf([]), commandId: null })).toBe(
      "Request received.",
    );
  });

  it("names the running step and the model and route that served it", () => {
    seq = 0;
    const events = [
      ev("command.accepted", null, "Request received"),
      ev("task.queued", "t_1", "Task queued: plan."),
      ev("model.started", "t_1", "Model call started."),
      ev("model.completed", "t_1", "Model call completed.", { usage }),
      ev("task.succeeded", "t_1", "Planned 2 tasks."),
      ev("task.started", "t_2", "Task started."),
    ];
    const s = withTasks([
      task("t_1", "plan", "succeeded"),
      task("t_2", "observation_analysis", "running"),
    ]);
    expect(line({ ...base, snapshot: s, log: logOf(events), commandId: "cmd_a" })).toBe(
      "Observation Analysis, Running",
    );
    events.push(ev("model.completed", "t_2", "Model call completed.", { usage }));
    expect(line({ ...base, snapshot: s, log: logOf(events), commandId: "cmd_a" })).toBe(
      "Muse Spark · Synthetic Replay: Observation Analysis, Running",
    );
  });

  it("gives the work card's outcome once the request ends, its cause when it failed", () => {
    seq = 0;
    const done = [
      ev("command.accepted", null, "Request received"),
      ev("command.completed", null, "Done.", { resultStatus: "failed" }),
    ];
    const s = withTasks([task("t_1", "plan", "failed", { failureCode: "http_503" })]);
    expect(line({ ...base, snapshot: s, log: logOf(done), commandId: "cmd_a" })).toBe(
      "Assessment failed: model service not responding. Question text kept.",
    );
    const refused = withTasks([task("t_1", "plan", "failed", { failureCode: "out_of_scope" })]);
    expect(line({ ...base, snapshot: refused, log: logOf(done), commandId: "cmd_a" })).toMatch(
      /^The request treats people/,
    );
  });

  it("offers a completed request's findings count, the accepted Evidence of its tasks", () => {
    seq = 0;
    const done = [
      ev("command.accepted", null, "Request received"),
      ev("command.completed", null, "Done.", { resultStatus: "succeeded" }),
    ];
    const evidence = {
      ...seed.records.evidenceRecords[0],
      id: "ev_from_t_1",
      status: "accepted",
      provenance: { ...seed.records.evidenceRecords[0]?.provenance, generatedByTaskId: "t_1" },
    } as unknown as CaseSnapshot["records"]["evidenceRecords"][number];
    const s = withTasks([task("t_1", "plan", "succeeded")]);
    const withEvidence = {
      ...s,
      records: { ...s.records, evidenceRecords: [...s.records.evidenceRecords, evidence] },
    };
    expect(
      askLine({ ...base, snapshot: withEvidence, log: logOf(done), commandId: "cmd_a" }),
    ).toEqual({ text: "Complete.", findings: 1 });
  });

  it("holds the outcome while a replay still plays at reading pace", () => {
    seq = 0;
    const events = [
      ev("command.accepted", null, "Request received"),
      ev("task.started", "t_1", "Task started."),
      ev("model.completed", "t_1", "Model call completed.", { usage }),
    ];
    const s = withTasks([task("t_1", "plan", "succeeded")]);
    expect(
      line({ ...base, snapshot: s, log: logOf(events), commandId: "cmd_a", pacing: true }),
    ).toBe("Muse Spark · Synthetic Replay: Plan, Running");
  });
});

describe("the status line of a question asked from the Ask", () => {
  const at = {
    sent: true,
    commandId: "cmd_a",
    refusal: null,
    pacing: false,
    causeOverdue: false,
  } as const;
  const status = (input: Partial<AskStatusInput> & Pick<AskStatusInput, "snapshot" | "log">) =>
    askStatus({ ...at, ...input });
  const accepted = () => [ev("command.accepted", null, "Request received")];
  const ended = (result: "succeeded" | "failed" | "cancelled" | "partial") => [
    ...accepted(),
    ev("command.completed", null, "Done.", { resultStatus: result }),
  ];

  it("is at work from Enter, before the server answers and before any event, and nothing before Enter", () => {
    seq = 0;
    const s = withTasks([]);
    expect(status({ snapshot: s, log: logOf([]), sent: false, commandId: null })).toBe(null);
    expect(status({ snapshot: s, log: logOf([]), commandId: null })).toEqual({
      state: "working",
      commandId: null,
    });
    expect(status({ snapshot: s, log: logOf([]) })).toEqual({
      state: "working",
      commandId: "cmd_a",
    });
    expect(status({ snapshot: s, log: logOf(accepted()) })).toEqual({
      state: "working",
      commandId: "cmd_a",
    });
  });

  it("stays at work while its steps run, and while a replay still plays at reading pace", () => {
    seq = 0;
    const running = withTasks([task("t_1", "source_research", "running")]);
    const log = logOf([...accepted(), ev("task.started", "t_1", "Task started.")]);
    expect(status({ snapshot: running, log })?.state).toBe("working");
    const done = withTasks([task("t_1", "source_research", "succeeded")]);
    expect(status({ snapshot: done, log: logOf(ended("succeeded")), pacing: true })?.state).toBe(
      "working",
    );
  });

  it("is answered once it ends with what it found, completely or in part", () => {
    seq = 0;
    const s = withTasks([task("t_1", "source_research", "succeeded")]);
    expect(status({ snapshot: s, log: logOf(ended("succeeded")) })).toEqual({
      state: "answered",
      commandId: "cmd_a",
    });
    seq = 0;
    expect(status({ snapshot: s, log: logOf(ended("partial")) })?.state).toBe("answered");
  });

  it("says why it failed from the failure code of its task, once the case record holds that task", () => {
    seq = 0;
    const log = logOf(ended("failed"));
    const failed = withTasks([
      task("t_1", "source_research", "failed", { failureCode: "model_not_configured" }),
    ]);
    expect(status({ snapshot: failed, log })).toEqual({
      state: "stopped",
      commandId: "cmd_a",
      text: "Could not answer: the model is not available here.",
    });
    // the record a moment behind the stream: still at work, so the sentence never changes under the visitor's eyes
    const behind = withTasks([task("t_1", "source_research", "running")]);
    expect(status({ snapshot: behind, log })?.state).toBe("working");
    // and if the record never names the task, the plain fact once the wait is over
    expect(status({ snapshot: withTasks([]), log, causeOverdue: true })).toEqual({
      state: "stopped",
      commandId: "cmd_a",
      text: "Could not answer: no step of the analysis finished.",
    });
  });

  it("names the cause of the task that failed by itself, not of the ones that failed because of it", () => {
    seq = 0;
    const s = withTasks([
      task("t_1", "plan", "failed", { failureCode: "http_503" }),
      task("t_2", "observation_analysis", "failed", { failureCode: "dependency_failed" }),
    ]);
    expect(status({ snapshot: s, log: logOf(ended("failed")) })).toMatchObject({
      text: ak["ask.stopped.down"].text,
    });
    const scope = withTasks([task("t_1", "plan", "failed", { failureCode: "out_of_scope" })]);
    expect(status({ snapshot: scope, log: logOf(ended("failed")) })).toMatchObject({
      text: ak["ask.stopped.scope"].text,
    });
  });

  it("says a stopped question was stopped", () => {
    seq = 0;
    const s = withTasks([task("t_1", "source_research", "cancelled")]);
    expect(status({ snapshot: s, log: logOf(ended("cancelled")) })).toEqual({
      state: "stopped",
      commandId: "cmd_a",
      text: "Could not answer: the question was stopped.",
    });
  });

  it("says a refusal by its code, the quota in its own words", () => {
    const s = withTasks([]);
    const refused = (refusal: AskStatusInput["refusal"]) =>
      status({ snapshot: s, log: logOf([]), commandId: null, refusal });
    expect(refused({ httpStatus: 429, code: "quota_exhausted", limit: "session" })).toEqual({
      state: "stopped",
      commandId: null,
      text: en["work.quotaUsed"].text,
    });
    expect(refused({ httpStatus: 429, code: "quota_exhausted", limit: "instance" })).toMatchObject({
      text: en["work.instanceLimit"].text,
    });
    expect(refused({ httpStatus: 401, code: "unauthenticated" })).toMatchObject({
      text: "Could not answer: this visit has ended, so reload the page to start a new one.",
    });
    expect(refused({ httpStatus: null, code: null })).toMatchObject({
      text: "Could not answer: the question did not reach the server.",
    });
  });
});

describe("the words for a failure code", () => {
  it("maps each code the follow-up route and the worker end with", () => {
    const words = (code: string | null) => ak[failedLine(code)].text;
    expect(words("model_not_configured")).toBe(
      "Could not answer: the model is not available here.",
    );
    expect(words("model_unreachable")).toBe("Could not answer: the model could not be reached.");
    expect(words("model_timeout")).toBe("Could not answer: the model took too long to reply.");
    expect(words("command_deadline")).toBe(words("model_timeout"));
    expect(words("model_refused")).toBe("Could not answer: the model declined the question.");
    expect(words("validation_rejected")).toBe(
      "Could not answer: the reply did not match the sources it cited.",
    );
    // a reply that is not the object the question asked for has its own words
    expect(words("reply_unreadable")).toBe(
      "Could not answer: the model's reply could not be read.",
    );
    expect(words("stale_inputs")).toBe(
      "Could not answer: a source changed while it was being read.",
    );
    expect(words("round_limit")).toBe("Could not answer: the analysis reached its step limit.");
    expect(words("out_of_scope")).toMatch(/^Could not answer: questions here are about land/);
  });

  it("reads an HTTP status the model service answered with", () => {
    expect(failedLine("http_401")).toBe("ask.stopped.notAvailable");
    expect(failedLine("http_403")).toBe("ask.stopped.notAvailable");
    expect(failedLine("http_429")).toBe("ask.stopped.busy");
    expect(failedLine("http_500")).toBe("ask.stopped.down");
    expect(failedLine("http_503")).toBe("ask.stopped.down");
    expect(failedLine("http_504")).toBe("ask.stopped.slow");
    expect(failedLine("http_400")).toBe("ask.stopped.declined");
  });

  it("says plainly that no step finished for a code it has no words for, or none", () => {
    expect(failedLine(null)).toBe("ask.stopped.other");
    expect(failedLine("executor_error")).toBe("ask.stopped.other");
    expect(failedLine("http_5xx")).toBe("ask.stopped.other");
  });

  it("names a refusal by who refused and what to do", () => {
    expect(refusedLine({ httpStatus: 429, code: "quota_exhausted" })).toBe(
      en["work.quotaUsed"].text,
    );
    expect(refusedLine({ httpStatus: 404, code: "not_found" })).toBe(
      ak["ask.stopped.visitEnded"].text,
    );
    expect(refusedLine({ httpStatus: 400, code: "invalid_request" })).toBe(
      ak["ask.stopped.notSent"].text,
    );
    expect(refusedLine({ httpStatus: 500, code: "internal_error" })).toBe(
      ak["ask.stopped.notSent"].text,
    );
  });
});

describe("reopening the records", () => {
  it("reopens only for a newer revision not already being reopened", () => {
    expect(shouldReopen(3, 3, null)).toBe(false);
    expect(shouldReopen(3, 2, null)).toBe(false);
    expect(shouldReopen(3, 4, null)).toBe(true);
    expect(shouldReopen(3, 4, 4)).toBe(false);
    expect(shouldReopen(4, 5, 4)).toBe(true);
  });
});
