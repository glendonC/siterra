import type { Event, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import {
  modelName,
  pacedEvents,
  projectActivity,
  projectTrace,
  replayOrigin,
  STAGES,
  stageGroups,
} from "./activity";

// synthetic events and tasks in the shapes the worker writes (seen on the replay route), for the rules only
let seq = 0;
const ev = (
  kind: Event["kind"],
  taskId: string | null,
  message: string,
  extra: Partial<Event> = {},
) =>
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
const usage = (origin: "synthetic" | "recorded" | undefined, provider = "replay") =>
  ({
    provider,
    model: "muse-spark-1.3",
    status: "succeeded",
    ...(origin ? { replayOrigin: origin } : {}),
  }) as unknown as Event["usage"];
const tool = (name: string, status: string) =>
  ({
    name,
    status,
    argumentSummary: "bundle x revision 1",
    resultEntityIds: [],
  }) as unknown as Event["tool"];
const task = (
  id: string,
  kind: Task["kind"],
  status: Task["status"],
  extra: Partial<Task> = {},
): Task =>
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

function run() {
  seq = 0;
  return [
    ev("command.accepted", null, "Request received"),
    ev("task.queued", "t_1", "Task queued: plan."),
    ev("model.started", "t_1", "Model call started."),
    ev("model.completed", "t_1", "Model call finished.", { usage: usage("synthetic") }),
    ev("validation.completed", "t_1", "Proposal accepted by validation.", {
      validation: { outcome: "accepted", issues: [] },
    }),
    ev("task.queued", "t_2", "Task queued: observation analysis."),
    ev("task.succeeded", "t_1", "Plan accepted with 1 task.", { resultStatus: "succeeded" }),
    ev("task.started", "t_2", "Task started: observation analysis."),
    ev("tool.started", "t_2", "Tool summarize_observations started.", {
      tool: tool("summarize_observations", "started"),
    }),
    ev("tool.completed", "t_2", "Tool summarize_observations returned 3 records.", {
      tool: tool("summarize_observations", "succeeded"),
    }),
    ev("model.completed", "t_2", "Model call finished.", { usage: usage("synthetic") }),
    ev("validation.completed", "t_2", "Proposal partly accepted by validation.", {
      validation: {
        outcome: "partial",
        issues: [{ code: "excerpt_mismatch", path: "/items/1", message: "not on page 3" }],
      },
    }),
    ev("task.partial", "t_2", "Observation task accepted 1 item.", { resultStatus: "partial" }),
  ];
}

const tasks = [task("t_1", "plan", "succeeded"), task("t_2", "observation_analysis", "partial")];

describe("projectActivity", () => {
  const rows = projectActivity(tasks, run(), "cmd_a");

  it("gives one row per task of the request, in the order they were queued", () => {
    expect(rows.map((r) => [r.taskId, r.label])).toEqual([
      ["t_1", "Plan"],
      ["t_2", "Observation Analysis"],
    ]);
  });

  it("states each step's status from its latest task event", () => {
    expect(rows.map((r) => r.status)).toEqual(["Done", "Partial"]);
  });

  it("badges the model by its name and route, and a deterministic tool as code", () => {
    expect(rows[0]?.badges).toEqual(["Muse Spark · Synthetic Replay"]);
    expect(rows[1]?.badges).toEqual([
      "Code: summarize_observations",
      "Muse Spark · Synthetic Replay",
    ]);
  });

  it("says what each step returned, from its own events", () => {
    expect(rows[0]?.lines.map((l) => l.text)).toEqual([
      "Proposal accepted by validation.",
      "Plan accepted with 1 task.",
    ]);
    expect(rows[1]?.lines.map((l) => l.text)).toContain(
      "Tool summarize_observations returned 3 records.",
    );
  });

  it("lists a rejected proposal with the rule that fired", () => {
    const rejected = rows[1]?.lines.filter((l) => l.kind === "rejected");
    expect(rejected?.map((l) => l.text)).toEqual([
      "Rejected: quote not found in its source (excerpt_mismatch)",
    ]);
  });

  it("marks a blocked step Dataset Not Loaded and names its missing inputs, from its task record", () => {
    const blocked = projectActivity(
      [
        task("t_3", "observation_analysis", "awaiting_input", {
          missingInputs: ["bundle_x", "period_y"],
        }),
      ],
      [ev("task.awaiting_input", "t_3", "Waiting for inputs.")],
      "cmd_a",
    );
    expect(blocked[0]?.status).toBe("Input Required");
    expect(blocked[0]?.badges).toContain("Dataset Not Loaded");
    expect(blocked[0]?.lines.find((l) => l.kind === "blocked")?.text).toBe(
      "Required inputs not loaded: bundle_x, period_y. Attach the datasets or limit the question to loaded layers.",
    );
  });

  it("says a stopped step was canceled, and gives a failed step's cause", () => {
    const r = projectActivity(
      [
        task("t_4", "source_research", "cancelled"),
        task("t_5", "hypothesis_comparison", "failed", { failureCode: "round_limit" }),
      ],
      [
        ev("task.cancelled", "t_4", "Task canceled."),
        ev("task.failed", "t_5", "Task failed.", { resultStatus: "failed" }),
      ],
      "cmd_a",
    );
    expect(r.map((x) => x.status)).toEqual(["Canceled", "Failed"]);
    expect(r[1]?.lines.find((l) => l.kind === "cause")?.text).toBe(
      "Cause: model round limit reached",
    );
  });

  it("marks a scope refusal Out of Scope with what is wrong and what is required", () => {
    const r = projectActivity(
      [task("t_7", "plan", "failed", { failureCode: "out_of_scope" })],
      [ev("task.failed", "t_7", "Task failed.", { resultStatus: "failed" })],
      "cmd_a",
    );
    expect(r[0]?.badges).toContain("Out of Scope");
    expect(r[0]?.lines.find((l) => l.kind === "cause")?.text).toBe(
      "Cause: The request treats people as the explanation by identity, or names a private individual. Questions must concern land, water, vegetation or land-use practices.",
    );
  });

  it("reads the status from the record while a step has no task event yet", () => {
    const r = projectActivity([task("t_6", "plan", "queued")], [], "cmd_a");
    expect(r[0]?.status).toBe("Queued");
  });

  it("in a paced replay, shows only the steps whose events have played", () => {
    const played = run().slice(0, 4);
    const r = projectActivity(tasks, played, "cmd_a", { playedOnly: true });
    // the plan has no task.started event: its model call starting is what says it runs
    expect(r.map((x) => [x.taskId, x.status])).toEqual([["t_1", "Running"]]);
  });
});

describe("stageGroups", () => {
  it("names the five stages of the engine in order", () => {
    expect(STAGES.map((s) => s.label)).toEqual([
      "Scope & Baseline",
      "Evidence",
      "Hypothesis Testing",
      "Interventions & Precedents",
      "Field Verification",
    ]);
  });

  it("puts each step under the stage its task kind belongs to, and keeps empty stages", () => {
    const r = projectActivity(
      [
        task("t_1", "plan", "succeeded"),
        task("t_2", "observation_analysis", "succeeded"),
        task("t_3", "source_research", "succeeded"),
        task("t_4", "hypothesis_comparison", "running"),
        task("t_4b", "explanation_branches", "running"),
        task("t_5", "intervention_feasibility", "queued"),
        task("t_6", "brief_package", "queued"),
      ],
      [],
      "cmd_a",
    );
    expect(stageGroups(r).map((g) => [g.label, g.rows.map((x) => x.taskId)])).toEqual([
      ["Scope & Baseline", ["t_1"]],
      ["Evidence", ["t_2", "t_3"]],
      ["Hypothesis Testing", ["t_4", "t_4b"]],
      ["Interventions & Precedents", ["t_5"]],
      ["Field Verification", ["t_6"]],
    ]);
    const plan = stageGroups(projectActivity([task("t_1", "plan", "running")], [], "cmd_a"));
    expect(plan.map((g) => g.rows.length)).toEqual([1, 0, 0, 0, 0]);
  });
});

describe("modelName", () => {
  it("names a model from its ID without its version", () => {
    expect(modelName("muse-spark-1.3")).toBe("Muse Spark");
    expect(modelName("muse-glimmer-30b")).toBe("Muse Glimmer 30b");
  });
});

describe("replayOrigin", () => {
  it("is the origin the request's model events state, or none on a live route", () => {
    expect(replayOrigin(run(), "cmd_a")).toBe("synthetic");
    seq = 0;
    expect(
      replayOrigin(
        [ev("model.completed", "t_1", "x", { usage: usage(undefined, "meta_model_api") })],
        "cmd_a",
      ),
    ).toBeUndefined();
  });
});

describe("pacedEvents", () => {
  it("keeps the first n events of the request and every other event", () => {
    const all = run();
    const other = { ...all[0], commandId: "cmd_b", sequence: 99 } as Event;
    const shown = pacedEvents([...all, other], "cmd_a", 3);
    expect(shown.filter((e) => e.commandId === "cmd_a")).toHaveLength(3);
    expect(shown).toContain(other);
  });
});

describe("projectTrace (CMP-16)", () => {
  it("summarizes model calls, tool calls, validation checks, and token usage", () => {
    const trace = projectTrace(run(), "cmd_a");
    expect(trace.summaryLine).toBe("Models: 2. Tools: 1. Checks: 1 accepted, 1 rejected.");
    expect(trace.usageLine).toBe("Tokens: 0 in, 0 out. Cost: $0.0000.");
    expect(trace.items.some((i) => i.detail.includes("muse-spark-1.3 (replay, synthetic)"))).toBe(
      true,
    );
    expect(trace.items.some((i) => i.detail.includes("summarize_observations"))).toBe(true);
  });
});
