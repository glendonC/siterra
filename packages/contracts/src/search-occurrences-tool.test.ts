import { describe, expect, it } from "vitest";
import { Task, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const task = {
  recordType: "Task",
  id: "task_example_one",
  revision: 1,
  createdAt: "2026-10-30T12:00:00Z",
  updatedAt: "2026-10-30T12:00:00Z",
  caseId: "case_example_atlas",
  commandId: "cmd_example_one",
  kind: "source_research",
  question: "Which plants do herders name?",
  status: "queued",
  dependsOnTaskIds: [],
  inputVersions: [],
  allowedTools: ["search_sources", "read_source", "search_occurrences", "propose_evidence"],
  outputEntityIds: [],
  idempotencyKey: "key-example-0001-aaaa",
  attempt: 0,
  maxModelRounds: 6,
  deadlineAt: "2026-10-30T12:03:00Z",
  budgetMicroUsd: 500000,
  spentMicroUsd: 0,
  checkpointId: null,
  failureCode: null,
  missingInputs: [],
  startedAt: null,
  finishedAt: null,
};

describe("contracts 1.20: the occurrence search tool", () => {
  it("accepts 1.20.0 and every earlier version of the same MAJOR", () => {
    expect(caseSchemaVersion).toBe("1.20.0");
    for (const earlier of ["1.2.0", "1.12.0", "1.19.0", caseSchemaVersion]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("lets a task be offered search_occurrences, and refuses a name that is not a tool", () => {
    expect(Task.safeParse(task).success).toBe(true);
    expect(Task.safeParse({ ...task, allowedTools: ["search_species"] }).success).toBe(false);
  });
});
