import { describe, expect, it } from "vitest";
import { askTaskId, chosenCount, isAskTaskId, isFollowUpTaskId } from "./task";

// The one task of a question typed in the Ask, by its id, and how many of the case's findings its answer chose: the
// count the steps say to a screen reader, so it is never 0 when the answer shows some.

const task = (
  id: string,
  status: "succeeded" | "failed" | "running",
  chosen: number,
  commandId = "cmd_q",
) => ({
  id,
  commandId,
  status,
  inputVersions: Array.from({ length: chosen }, (_, i) => ({
    entityId: `ev_x_${String(i)}`,
    revision: 1,
  })),
});

describe("the question's task", () => {
  it("is named by its command's hash, apart from the earlier source-reading task", () => {
    expect(askTaskId("a1b2c3")).toBe("task_ask_a1b2c3");
    expect(isAskTaskId("task_ask_a1b2c3")).toBe(true);
    expect(isAskTaskId("task_cmd_a1b2c3")).toBe(false);
    expect(isAskTaskId(null)).toBe(false);
    expect(isFollowUpTaskId("task_cmd_a1b2c3")).toBe(true);
    expect(isFollowUpTaskId("task_ask_a1b2c3")).toBe(true);
    expect(isFollowUpTaskId("task_01M623GYN8XWZRC2YTRSHFWD1F")).toBe(false);
  });

  it("counts the findings its answer chose, none for a task that did not succeed, and nothing before it is held", () => {
    expect(chosenCount([task("task_ask_a1b2c3", "succeeded", 2)], "cmd_q")).toBe(2);
    expect(chosenCount([task("task_ask_a1b2c3", "succeeded", 0)], "cmd_q")).toBe(0);
    expect(chosenCount([task("task_ask_a1b2c3", "failed", 0)], "cmd_q")).toBe(0);
    expect(chosenCount([], "cmd_q")).toBeNull();
    expect(chosenCount([task("task_ask_a1b2c3", "succeeded", 2)], null)).toBeNull();
    // another command's task, or a task of another kind, is not this question's
    expect(chosenCount([task("task_ask_a1b2c3", "succeeded", 2, "cmd_other")], "cmd_q")).toBeNull();
    expect(chosenCount([task("task_plan_1", "succeeded", 5)], "cmd_q")).toBeNull();
  });
});
