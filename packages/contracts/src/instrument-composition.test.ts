import { describe, expect, it } from "vitest";
import { Task, ToolCallInfo, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";
import { instrumentKinds } from "./instruments.ts";
import {
  ProposeEvidence,
  ProposeHypotheses,
  ProposeInstruments,
  ProposeInterventions,
  ProposePlan,
  ProposePredictions,
  plannableTaskKinds,
  strictSubsetIssues,
  toModelJsonSchema,
} from "./model-facing.ts";

const at = "2026-10-29T20:00:00-04:00";
const task = (overrides: Record<string, unknown> = {}) => ({
  recordType: "Task",
  id: "task_example_instruments",
  revision: 1,
  createdAt: at,
  updatedAt: at,
  caseId: "case_example_atlas",
  commandId: "cmd_example_instruments",
  kind: "instrument_composition",
  question: "Order the instruments for the open question.",
  status: "queued",
  dependsOnTaskIds: [],
  inputVersions: [],
  allowedTools: ["propose_instruments"],
  outputEntityIds: [],
  idempotencyKey: "task-example-instruments-0001",
  attempt: 0,
  maxModelRounds: 2,
  deadlineAt: "2026-10-29T21:00:00-04:00",
  budgetMicroUsd: 100000,
  spentMicroUsd: 0,
  checkpointId: null,
  failureCode: null,
  missingInputs: [],
  startedAt: null,
  finishedAt: null,
  ...overrides,
});

describe("contracts 1.15: the instrument composition task", () => {
  it("accepts 1.15.0 and every earlier version of the same MAJOR", () => {
    expect(acceptedCaseSchemaVersions).toContain(caseSchemaVersion);
    for (const earlier of ["1.2.0", "1.12.0", "1.13.0", "1.14.0", "1.15.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("is a Task kind whose only tool is the structured output propose_instruments", () => {
    expect(Task.safeParse(task()).success).toBe(true);
    expect(Task.safeParse(task({ kind: "plan_instruments" })).success).toBe(false);
    expect(Task.safeParse(task({ allowedTools: ["propose_instrument"] })).success).toBe(false);
  });

  it("can be named as a tool call in the event log", () => {
    const shape = ToolCallInfo.shape.name;
    expect(shape.safeParse("propose_instruments").success).toBe(true);
    expect(shape.safeParse("propose_instrument").success).toBe(false);
  });

  it("is made by host code: the planner cannot propose it", () => {
    expect(plannableTaskKinds as readonly string[]).not.toContain("instrument_composition");
  });
});

describe("INST-06: the model-facing schemas offer no instrument kind", () => {
  const schemas = {
    ProposePlan,
    ProposeEvidence,
    ProposeHypotheses,
    ProposeInterventions,
    ProposePredictions,
    ProposeInstruments,
  };

  it("keeps every model-facing schema inside the strict subset", () => {
    for (const [name, schema] of Object.entries(schemas)) {
      expect(strictSubsetIssues(toModelJsonSchema(schema)), name).toEqual([]);
    }
  });

  it("names no instrument kind in any model-facing schema", () => {
    for (const [name, schema] of Object.entries(schemas)) {
      const text = JSON.stringify(toModelJsonSchema(schema));
      for (const kind of instrumentKinds) {
        expect(text.includes(`"${kind}"`), `${name} offers ${kind}`).toBe(false);
      }
    }
  });

  it("lets the model return an order of IDs and sentences, and nothing else", () => {
    const ok = {
      order: ["inst_a", "inst_b"],
      captions: [{ specId: "inst_a", ink: "One.", grey: "Two." }],
    };
    expect(ProposeInstruments.safeParse(ok).success).toBe(true);
    expect(ProposeInstruments.safeParse({ ...ok, kind: "layer_stack" }).success).toBe(false);
    expect(
      ProposeInstruments.safeParse({
        ...ok,
        captions: [{ specId: "inst_a", ink: "One.", grey: "Two.", parameters: {} }],
      }).success,
    ).toBe(false);
  });
});
