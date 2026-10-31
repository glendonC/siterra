import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Event, type CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { runModel } from "./model";

// The RECORDED run "Founder instance smoke 1" (specimen R's read-only extract; the lead, 30 Oct: tests and frames
// only) through the same event model the live stream feeds. Its figures are the specimen's, from the run's records.
const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "recorded-run.json"), "utf8"),
) as { commandId: string; snapshot: unknown; events: unknown[] };
const snapshot = raw.snapshot as CaseSnapshot;
const events = raw.events.map((e) => Event.parse(e));
const id = raw.commandId;

describe("runModel over the recorded run (U29, specimen R)", () => {
  const r = runModel(snapshot, events, id);

  it("reads the run's length, tasks, calls and tools from its own events", () => {
    expect(r.done).toBe(true);
    expect(r.replay).toBeNull();
    expect(r.nowMs).toBe(101_121);
    expect(r.tasks.reduce((n, t) => n + t.calls, 0)).toBe(26);
    expect(r.tasks.reduce((n, t) => n + t.tools, 0)).toBe(29);
    expect(r.tasks.reduce((n, t) => n + t.failedTools, 0)).toBe(2);
    expect(r.tasks.every((t) => t.state === "succeeded")).toBe(true);
  });

  it("lands its 23 findings where their records put them", () => {
    const by = (l: string) => r.findings.filter((f) => f.lands === l).length;
    expect(r.findings).toHaveLength(23);
    expect([by("land"), by("source"), by("unchecked")]).toEqual([7, 7, 9]);
  });

  it("seals five explanations and scores them by the merge, with one proposed check", () => {
    expect(r.branches).toHaveLength(5);
    expect(r.merge?.counts).toEqual({ contradicted: 3, consistent: 1, cannot_be_assessed: 1 });
    expect(r.checks.map((c) => c.label)).toEqual(["Local Rain Records"]);
  });

  it("unfolds in order: events not yet given do not exist", () => {
    const half = runModel(snapshot, events.slice(0, 60), id);
    expect(half.done).toBe(false);
    expect(half.merge).toBeNull();
    expect(half.findings.length).toBeLessThan(23);
  });
});
