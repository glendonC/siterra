import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Event, type CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { runModel } from "./model";

// A replayed run on the UI lane's own database (the synthetic replay route; no model was called), trimmed to the
// records the run model reads.
const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "replay-run.json"), "utf8"),
) as { commandId: string; snapshot: unknown; events: unknown[] };
const snapshot = raw.snapshot as CaseSnapshot;
const events = raw.events.map((e) => Event.parse(e));
const id = raw.commandId;

describe("runModel (U29, specimen R)", () => {
  it("reads the run's tasks, calls, tools and length from its own events", () => {
    const r = runModel(snapshot, events, id);
    expect(r.done).toBe(true);
    expect(r.replay).toBe("synthetic");
    expect(
      r.tasks.map((t) => `${t.kind} ${t.state} ${String(t.calls)} ${String(t.tools)}`),
    ).toEqual([
      "plan succeeded 1 0",
      "observation_analysis succeeded 2 1",
      "observation_analysis succeeded 2 1",
    ]);
    expect(r.tasks.every((t) => t.model === "Muse Spark")).toBe(true);
    expect(
      r.tasks.every((t) => t.startMs !== null && t.endMs !== null && t.endMs >= t.startMs),
    ).toBe(true);
    expect(r.nowMs).toBeGreaterThanOrEqual(Math.max(...r.tasks.map((t) => t.endMs ?? 0)));
  });

  it("gives each finding its verification word and its landing, from its record", () => {
    const r = runModel(snapshot, events, id);
    expect(r.findings.length).toBe(snapshot.records.evidenceRecords.length);
    for (const f of r.findings) {
      const ev = snapshot.records.evidenceRecords.find((x) => x.id === f.id);
      if (!ev) throw new Error(f.id);
      const computedHere =
        ev.provenance.verificationStatus === "computed_checked" &&
        ev.geoSelectionId === snapshot.case.activeGeoSelectionId;
      expect(f.lands === "land").toBe(computedHere);
    }
  });

  it("knows only the events given so far: halfway, the later tasks are still running", () => {
    const half = events.slice(0, Math.floor(events.length / 2));
    const r = runModel(snapshot, half, id);
    expect(r.done).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.tasks.some((t) => t.state === "running")).toBe(true);
  });

  it("is empty for a command the log does not hold", () => {
    const r = runModel(snapshot, events, "cmd_none");
    expect(r.tasks).toEqual([]);
    expect(r.done).toBe(false);
  });
});
