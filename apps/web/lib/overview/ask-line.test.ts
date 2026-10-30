import type { CaseSnapshot, Event, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import type { EventLog } from "../case/events";
import { seed } from "../instruments/seed-listing";
import { askLine, shouldReopen } from "./ask-line";

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

describe("the ask's activity line", () => {
  it("shows nothing before Enter, and the catalog's refusal when the server refuses", () => {
    const s = withTasks([]);
    expect(askLine({ ...base, snapshot: s, log: logOf([]), commandId: null, sent: false })).toBe(
      null,
    );
    expect(
      askLine({ ...base, snapshot: s, log: logOf([]), commandId: null, notice: "work.quotaUsed" }),
    ).toBe("Demo request limit reached for this session. Question text kept.");
    expect(askLine({ ...base, snapshot: s, log: logOf([]), commandId: null })).toBe(
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
    expect(askLine({ ...base, snapshot: s, log: logOf(events), commandId: "cmd_a" })).toBe(
      "Observation Analysis, Running",
    );
    events.push(ev("model.completed", "t_2", "Model call completed.", { usage }));
    expect(askLine({ ...base, snapshot: s, log: logOf(events), commandId: "cmd_a" })).toBe(
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
    expect(askLine({ ...base, snapshot: s, log: logOf(done), commandId: "cmd_a" })).toBe(
      "Assessment failed: model service not responding. Question text kept.",
    );
    const refused = withTasks([task("t_1", "plan", "failed", { failureCode: "out_of_scope" })]);
    expect(askLine({ ...base, snapshot: refused, log: logOf(done), commandId: "cmd_a" })).toMatch(
      /^The request treats people/,
    );
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
      askLine({ ...base, snapshot: s, log: logOf(events), commandId: "cmd_a", pacing: true }),
    ).toBe("Muse Spark · Synthetic Replay: Plan, Running");
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
