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

const recordedRaw = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "recorded-run.json"), "utf8"),
) as { commandId: string; snapshot: unknown; events: unknown[] };
const recordedSnapshot = recordedRaw.snapshot as CaseSnapshot;
const recordedEvents = recordedRaw.events.map((e) => Event.parse(e));
const recordedId = recordedRaw.commandId;

const RAW_TOOL_NAMES =
  /\b(?:read_source|search_sources|summarize_observations|read_dataset_manifest|compare_series|read_recipe_result|list_recipes|search_occurrences|read_case|propose_plan|propose_evidence|propose_predictions|src_[A-Za-z0-9_-]+|bundle_[A-Za-z0-9_-]+)\b/;

describe("runModel (U29, specimen R)", () => {
  it("reads the run's tasks, calls, tools and length from its own events", () => {
    const r = runModel(snapshot, events, id);
    expect(r.done).toBe(true);
    expect(r.replay).toBe("synthetic");
    expect(r.totalCostMicroUsd).toBeNull();
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
    expect(r.totalCostMicroUsd).toBeNull();
    expect(r.needsReview).toBe(false);
  });

  it("derives active cursors, steps, searched chips, and costs from recorded events with zero internal IDs", () => {
    const t0 = Date.parse(
      recordedEvents.find((e) => e.kind === "command.accepted")?.occurredAt ?? "",
    );
    const sliceAt = (atMs: number) =>
      recordedEvents.filter((e) => Date.parse(e.occurredAt) - t0 <= atMs);

    const mid = runModel(recordedSnapshot, sliceAt(26000), recordedId);
    expect(mid.done).toBe(false);
    expect(mid.needsReview).toBe(false);
    const activeCursors = mid.tasks.filter((t) => t.state === "running" && t.activeTarget !== null);
    expect(activeCursors.length).toBe(3);
    expect(activeCursors.map((t) => t.activeLabel)).toEqual(
      expect.arrayContaining([
        "Reading the lowest elevation band",
        "Reading catchment rainfall record",
        "Reading El Aayadi et al. 2026",
      ]),
    );

    const full = runModel(recordedSnapshot, recordedEvents, recordedId);
    expect(full.done).toBe(true);
    expect(full.needsReview).toBe(true);
    expect(full.totalCostMicroUsd).toBe(307558);
    expect(full.tasks.every((t) => t.activeTarget === null && t.activeLabel === null)).toBe(true);

    for (const t of full.tasks) {
      for (const s of t.steps) {
        expect(s.label).not.toMatch(RAW_TOOL_NAMES);
      }
      for (const chip of t.searchedChips) {
        expect(chip).not.toMatch(RAW_TOOL_NAMES);
      }
    }

    const srcTask = full.tasks.find((t) => t.kind === "source_research");
    expect(srcTask?.searchedChips).toEqual(
      expect.arrayContaining(["Aakairi et al. 2026", "Herrera 2024", "El Aayadi et al. 2026"]),
    );
    expect(srcTask?.steps.map((s) => s.label)).toEqual(
      expect.arrayContaining([
        "Searching published sources",
        "Reading El Aayadi et al. 2026",
        "Proposal checked by code",
      ]),
    );
  });

  it("formats page-level source targets when tool events carry pages", () => {
    const firstAccepted = recordedEvents.find((e) => e.kind === "command.accepted");
    const srcTask = recordedSnapshot.records.taskRecords.find((t) => t.kind === "source_research");
    if (!firstAccepted || !srcTask) throw new Error("missing fixture records");
    const customEvents: Event[] = [
      firstAccepted,
      {
        ...firstAccepted,
        sequence: 2,
        kind: "task.started",
        taskId: srcTask.id,
        entityIds: [srcTask.id],
      },
      {
        ...firstAccepted,
        sequence: 3,
        kind: "tool.started",
        taskId: srcTask.id,
        entityIds: [],
        tool: {
          name: "read_source",
          status: "started",
          attempt: 1,
          startedAt: firstAccepted.occurredAt,
          endedAt: null,
          durationMs: null,
          argumentSummary: "source src_SCI-03, page 7",
          resultEntityIds: ["src_SCI-03"],
          errorCode: null,
          target: {
            kind: "source",
            stratumId: null,
            bundleId: null,
            recipeId: null,
            sourceId: "src_SCI-03",
            pages: [7],
            sections: [],
            queryTerms: [],
          },
        },
      },
    ];
    const r = runModel(recordedSnapshot, customEvents, recordedId);
    const t = r.tasks.find((x) => x.id === srcTask.id);
    expect(t?.activeLabel).toBe("Checking El Aayadi et al. 2026, p. 7");
    expect(t?.steps[0]?.label).toBe("Checking El Aayadi et al. 2026, p. 7");
  });
});
