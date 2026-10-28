import { describe, expect, it } from "vitest";
import { projectWork, type EventView, type TaskView } from "./work";

// Synthetic records for the shape of the projection only; no value here is a measurement.
const task = (
  id: string,
  kind: TaskView["kind"],
  status: TaskView["status"],
  at: string,
): TaskView => ({
  id,
  commandId: "cmd_1",
  kind,
  question: `Question of ${id}`,
  status,
  createdAt: at,
});

const tasks: TaskView[] = [
  task("task_b", "source_research", "running", "2026-10-27T20:00:02Z"),
  task("task_plan", "plan", "succeeded", "2026-10-27T20:00:00Z"),
  task("task_a", "observation_analysis", "succeeded", "2026-10-27T20:00:01Z"),
  task("task_c", "hypothesis_comparison", "queued", "2026-10-27T20:00:03Z"),
  {
    ...task("task_other", "source_research", "running", "2026-10-27T20:00:04Z"),
    commandId: "cmd_2",
  },
];

const events: EventView[] = [
  {
    taskId: "task_a",
    sequence: 4,
    kind: "task.progress",
    message: "Loading 84 months of rainfall",
  },
  {
    taskId: "task_a",
    sequence: 9,
    kind: "task.succeeded",
    message: "Loaded 84 months of rainfall (CHIRPS grid, 33 cells)",
  },
  { taskId: "task_b", sequence: 7, kind: "task.progress", message: "Retrieved 3 of 6 sources" },
  { taskId: "task_b", sequence: 5, kind: "task.progress", message: "Retrieving published sources" },
  { taskId: "task_b", sequence: 8, kind: "model.started", message: "model call" },
];

describe("projectWork", () => {
  const w = projectWork("cmd_1", tasks, events);

  it("numbers this command's tasks in order, without the plan task", () => {
    expect(w.steps.map((s) => [s.n, s.taskId])).toEqual([
      [1, "task_a"],
      [2, "task_b"],
      [3, "task_c"],
    ]);
  });

  it("shows each task's latest milestone, or its question before any", () => {
    expect(w.steps.map((s) => s.text)).toEqual([
      "Loaded 84 months of rainfall (CHIRPS grid, 33 cells)",
      "Retrieved 3 of 6 sources",
      "Question of task_c",
    ]);
  });

  it("takes status from the records and says whether work is still running", () => {
    expect(w.steps.map((s) => s.state)).toEqual(["done", "running", "queued"]);
    expect(w.running).toBe(true);
    expect(
      projectWork(
        "cmd_1",
        tasks.map((t) => ({ ...t, status: "succeeded" as const })),
        events,
      ).running,
    ).toBe(false);
  });
});
