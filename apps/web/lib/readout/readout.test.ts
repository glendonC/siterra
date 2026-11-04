import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BranchMerge, CaseSnapshot, Evidence, Task } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { en } from "../copy/en";
import { rd, type ReadoutMessageId } from "../copy/readout";
import { seed, seedListing } from "../instruments/seed-listing";
import { bandLimitsOf } from "../land/record";
import { findingsFrom } from "../overview/findings";
import { withSyntheticPackage, type RecordedRun } from "../package/fixtures/synthetic";
import {
  datedText,
  findingWords,
  followUpOf,
  joinLabels,
  nextWords,
  periodIdWords,
  readoutOf,
  reviewWords,
  seasonIdWords,
  sentenceCase,
  stratumRange,
  type Readout,
} from "./readout";

// The readout reads one case record and writes no science of its own: verdicts come from the merge, the next checks
// from the field plan, the reviews from the plan's own requests. Checked on the demo case (the seed with the recorded
// 28 Oct run and the synthetic package, as the package tests build it: the home answer) and on the replayed run, whose
// own record holds a different merge, no measurements and no brief (the run's answer). Each edited copy below changes
// one record field, so what the column says can be traced to that field.

const run28 = (
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "..",
        "packages",
        "contracts",
        "fixtures",
        "recorded-live-run-2026-10-28-branch-merge.json",
      ),
      "utf8",
    ),
  ) as { records: RecordedRun }
).records;
const demo = withSyntheticPackage(seed, run28).snapshot;

const recorded = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "run", "fixtures", "recorded-run.json"), "utf8"),
) as { commandId: string; snapshot: CaseSnapshot };

/** The readout as the overview builds it: the record's own findings and its band limits. */
const readout = (snapshot: CaseSnapshot, commandId?: string | null) => {
  const { findings, bandLimit } = findingsFrom(snapshot, seedListing);
  return readoutOf(snapshot, findings, bandLimit?.display ?? "", {
    commandId,
    limits: bandLimitsOf(snapshot),
  });
};

/** A copy of a record with some of its collections replaced. */
const withRecords = (
  snapshot: CaseSnapshot,
  records: Partial<CaseSnapshot["records"]>,
): CaseSnapshot => ({ ...snapshot, records: { ...snapshot.records, ...records } });

const only = <T>(rows: readonly T[] | undefined, pick: (row: T) => boolean, what: string): T => {
  const row = rows?.find(pick);
  if (row === undefined) throw new Error(`the record holds no ${what}`);
  return row;
};

const demoMerge: BranchMerge = only(demo.records.branchMergeRecords, () => true, "merge");
const UP = "meas_pixel_trend_upward_fdr_share_catchment_mar_jun";
const DOWN = "meas_pixel_trend_downward_fdr_share_catchment_mar_jun";
const SHARE = /^area_share_(?:upward|downward)_fdr$/;

/** The verdict rows as the column lists them: each status with its explanations' labels. */
const verdicts = (r: Readout) => r.verdicts.map((v) => [v.status, v.rows.map((x) => x.label)]);

describe("the home answer (the demo case)", () => {
  const r = readout(demo);

  it("says since when and how much of the area greened and browned, in one sentence", () => {
    expect(r.answer.claim).toBe("Since 2000, 24.7% of the area has greened and 0.1% has browned.");
    expect(r.answer.claimKind).toBe("measurement");
    expect(r.answer.claimIds).toEqual([UP, DOWN]);
    expect(r.answer.from).toBe("2000");
  });

  it("puts every explanation under its verdict, the verdicts in a fixed order and the labels in the record's", () => {
    expect(verdicts(r)).toEqual([
      ["cannot_be_assessed", ["Grazing", "Land use", "Snow or terrain"]],
      ["contradicted", ["Rainfall", "Data artefact"]],
    ]);
    expect(r.explanations?.rows.some((x) => x.stale)).toBe(false);
  });

  it("says what each check of the bound field plan would tell apart, in the plan's order", () => {
    const checks = r.ground?.checks ?? [];
    expect(checks.map(nextWords)).toEqual([
      "Herd numbers and routes by season would tell grazing from snow or terrain.",
      "Orchard planting years would tell land use from snow or terrain.",
    ]);
    expect(checks.map((c) => [c.number, c.fieldCheckId, c.what, c.place, c.drawn])).toEqual([
      ["01", "herd_records", "Herd numbers and routes by season", "Upper elevation band", true],
      [
        "02",
        "orchard_history",
        "Orchard planting years",
        "Valley-bottom fields and orchards",
        false,
      ],
    ]);
    expect(checks[0]?.stratumKeys).toEqual(["elevation_high"]);
  });

  it("names the reviews requested of the bound plan", () => {
    expect(reviewWords(r.ground?.reviews ?? [])).toBe("Community and scientific review requested");
  });
});

describe("the run's answer (the recorded run's own record)", () => {
  const r = readout(recorded.snapshot);

  it("says which explanation fits the evidence, in one sentence", () => {
    expect(r.answer.claim).toBe("Rainfall fits the evidence.");
    expect(r.answer.claimKind).toBe("status");
    expect(r.answer.claimIds).toEqual(["rainfall"]);
    expect(r.answer.from).toBeNull();
  });

  it("puts under their verdicts only the explanations the answer does not name", () => {
    expect(verdicts(r)).toEqual([
      ["cannot_be_assessed", ["Grazing"]],
      ["contradicted", ["Land use", "Snow or terrain", "Data artefact"]],
    ]);
    // the merge's own rows keep every explanation
    expect(r.explanations?.rows.map((x) => x.explanationId)).toEqual([
      "rainfall",
      "grazing",
      "land_use",
      "snow_terrain",
      "data_artefact",
    ]);
  });

  it("takes the next check from the merge's own field plan when no action carries one", () => {
    const checks = r.ground?.checks ?? [];
    expect(checks.map(nextWords)).toEqual(["Local rain records would tell rainfall from grazing."]);
    expect(checks.map((c) => [c.fieldCheckId, c.drawn])).toEqual([["local_rain_records", false]]);
    expect(r.ground?.reviews).toEqual([]);
  });
});

// The owner's R1: no word of the record's own vocabulary reaches the column. Every string the column can show, for
// the home answer and the run's, with a follow-up's findings, as the column composes them.
describe("every string the column can show", () => {
  const RECORD_WORDS =
    /\b(?:merge[sd]?|status(?:es)?|branch(?:es)?|stale|revisions?|proposed|recorded|replay(?:ed|s)?|composite|claim kinds?|model estimates?|false discovery)\b/i;
  const SNAKE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;
  const FIXED: readonly ReadoutMessageId[] = [
    "readout.verdict.consistent",
    "readout.verdict.cannot_be_assessed",
    "readout.verdict.contradicted",
    "readout.verdict.stale",
    "readout.next.head",
    "readout.views.head",
    "readout.request.head",
    "readout.request.none",
    "readout.review.key",
    "readout.key.views",
  ];

  const column = (r: Readout): string[] => [
    ...[r.answer.claim].filter((s): s is string => s !== null),
    ...r.verdicts.flatMap((v) => [
      rd[`readout.verdict.${v.status}`].text,
      ...v.rows.map((x) => x.label),
    ]),
    ...(r.ground?.checks ?? []).map(nextWords),
    ...[reviewWords(r.ground?.reviews ?? [])].filter((s): s is string => s !== null),
    ...(r.request?.findings ?? []).map(findingWords),
    ...[false, true].flatMap((all) => followUpOf(r.request?.findings ?? [], all).toggle ?? []),
    ...FIXED.map((id) => rd[id].text),
    en["run.tree.needsYou"].text,
  ];

  it.each([
    ["the home answer", demo, null],
    ["the run's answer", recorded.snapshot, null],
    ["the run's answer with its findings as a follow-up", recorded.snapshot, recorded.commandId],
  ] as const)("%s uses none of the record's vocabulary", (_name, snapshot, commandId) => {
    const shown = column(readout(snapshot, commandId));
    if (commandId) expect(readout(snapshot, commandId).request?.findings.length).toBeGreaterThan(0);
    expect(shown.filter((s) => RECORD_WORDS.test(s) || SNAKE.test(s))).toEqual([]);
  });

  it("holds no catalog string with the record's vocabulary", () => {
    const words = Object.entries(rd).filter(([, m]) => RECORD_WORDS.test(m.text));
    expect(words).toEqual([]);
  });
});

describe("the answer's other forms", () => {
  it("says no part of the area changed when both shares are exactly zero", () => {
    const flat = withRecords(demo, {
      measurementRecords: demo.records.measurementRecords.map((m) =>
        SHARE.test(m.metric) ? { ...m, value: 0 } : m,
      ),
    });
    expect(readout(flat).answer.claim).toBe(
      "Since 2000, no part of the area has greened or browned.",
    );
  });

  it("takes the first year from the share's own record", () => {
    const moved = withRecords(demo, {
      measurementRecords: demo.records.measurementRecords.map((m) =>
        SHARE.test(m.metric) && m.source
          ? {
              ...m,
              source: { ...m.source, period: { start: "2001", end: "2024", window: "apr_jul" } },
            }
          : m,
      ),
    });
    expect(readout(moved).answer).toMatchObject({
      claim: "Since 2001, 24.7% of the area has greened and 0.1% has browned.",
      from: "2001",
    });
  });

  it("leaves the other share out when its record covers another period", () => {
    const apart = withRecords(demo, {
      measurementRecords: demo.records.measurementRecords.map((m) =>
        m.id === DOWN && m.source
          ? { ...m, source: { ...m.source, period: { ...m.source.period, window: "jul_oct" } } }
          : m,
      ),
    });
    const a = readout(apart).answer;
    expect(a.claim).toBe("Since 2000, 24.7% of the area has greened.");
    expect(a.claimIds).toEqual([UP]);
  });

  it("says the explanations that do not fit when none fits and nothing was measured", () => {
    const refuted = withRecords(demo, {
      measurementRecords: [],
      branchMergeRecords: [
        {
          ...demoMerge,
          branches: demoMerge.branches.map((b) => ({ ...b, status: "contradicted" as const })),
        },
      ],
    });
    expect(readout(refuted).answer).toMatchObject({
      claim:
        "Rainfall, grazing, land use, snow or terrain and data artefact do not fit the evidence.",
      claimKind: "status",
      claimIds: ["rainfall", "grazing", "land_use", "snow_terrain", "data_artefact"],
      from: null,
    });
    // every explanation is in the answer, so no verdict row is left to list
    expect(readout(refuted).verdicts).toEqual([]);
    const one = withRecords(refuted, {
      branchMergeRecords: [
        {
          ...demoMerge,
          branches: demoMerge.branches
            .slice(0, 1)
            .map((b) => ({ ...b, status: "contradicted" as const })),
        },
      ],
    });
    expect(readout(one).answer.claim).toBe("Rainfall does not fit the evidence.");
  });

  it("says several explanations fit in the plural", () => {
    const both = withRecords(recorded.snapshot, {
      branchMergeRecords: (recorded.snapshot.records.branchMergeRecords ?? []).map((m) => ({
        ...m,
        branches: m.branches.map((b) =>
          b.explanationId === "grazing" ? { ...b, status: "consistent" as const } : b,
        ),
      })),
    });
    expect(readout(both).answer.claim).toBe("Rainfall and grazing fit the evidence.");
    expect(verdicts(readout(both))).toEqual([
      ["contradicted", ["Land use", "Snow or terrain", "Data artefact"]],
    ]);
  });

  it("says which explanations lack data when nothing was measured and none fits or does not", () => {
    const open = withRecords(demo, {
      measurementRecords: [],
      branchMergeRecords: [
        {
          ...demoMerge,
          branches: demoMerge.branches.map((b) => ({
            ...b,
            status: "cannot_be_assessed" as const,
          })),
        },
      ],
    });
    expect(readout(open).answer).toMatchObject({
      claim:
        "Not enough data yet on rainfall, grazing, land use, snow or terrain and data artefact.",
      claimKind: "status",
    });
    expect(readout(open).verdicts).toEqual([]);
  });

  it("says no explanation has been tested when nothing was measured or tested", () => {
    const bare = withRecords(recorded.snapshot, {
      branchMergeRecords: [],
      explanationBranchRecords: [],
    });
    expect(readout(bare).answer).toMatchObject({
      claim: "No explanation has been tested yet.",
      claimKind: null,
      claimIds: [],
    });
    expect(readout(bare).explanations).toBeNull();
    expect(readout(bare).verdicts).toEqual([]);
    expect(readout(bare).ground).toBeNull();
    // a measurement with no explanation tested is the answer alone
    const measuredOnly = withRecords(demo, {
      branchMergeRecords: [],
      explanationBranchRecords: [],
      operationalActionRecords: [],
    });
    expect(readout(measuredOnly).answer.claim).toBe(
      "Since 2000, 24.7% of the area has greened and 0.1% has browned.",
    );
    expect(readout(measuredOnly).verdicts).toEqual([]);
  });
});

describe("the verdicts", () => {
  it("marks a branch whose record moved past the merge as out of date, and only that one", () => {
    const entry = only(demoMerge.branches, (b) => b.explanationId === "grazing", "grazing entry");
    const moved = withRecords(demo, {
      explanationBranchRecords: (demo.records.explanationBranchRecords ?? []).map((b) =>
        b.id === entry.branchId ? { ...b, revision: entry.branchRevision + 1 } : b,
      ),
    });
    expect(readout(moved).explanations?.rows.map((x) => [x.explanationId, x.stale])).toEqual([
      ["rainfall", false],
      ["grazing", true],
      ["land_use", false],
      ["snow_terrain", false],
      ["data_artefact", false],
    ]);
  });

  it("labels an explanation the record holds no branch for from its id", () => {
    const r = readout(withRecords(demo, { explanationBranchRecords: [] }));
    expect(r.explanations?.rows.map((x) => x.label)).toEqual([
      "Rainfall",
      "Grazing",
      "Land use",
      "Snow terrain",
      "Data artefact",
    ]);
    expect(verdicts(r)[0]).toEqual(["cannot_be_assessed", ["Grazing", "Land use", "Snow terrain"]]);
  });
});

describe("the next checks", () => {
  const { fieldPlan } = demoMerge;
  if (!fieldPlan) throw new Error("the demo merge holds no field plan");
  const herd = only(fieldPlan.measurements, (m) => m.fieldCheckId === "herd_records", "herd check");

  it("joins several pairs a check alone tells apart", () => {
    const s = withRecords(demo, {
      branchMergeRecords: [
        {
          ...demoMerge,
          fieldPlan: {
            ...fieldPlan,
            measurements: fieldPlan.measurements.map((m) =>
              m.fieldCheckId === herd.fieldCheckId
                ? {
                    ...m,
                    onlySeparates: [
                      ["snow_terrain", "grazing"],
                      ["land_use", "rainfall"],
                    ] as [string, string][],
                  }
                : m,
            ),
          },
        },
      ],
    });
    // each pair in the record's order, whatever order the plan wrote it in
    expect(readout(s).ground?.checks.map(nextWords)[0]).toBe(
      "Herd numbers and routes by season would tell grazing from snow or terrain and rainfall from land use.",
    );
  });

  it("names a check that tells nothing apart alone, with no pairs", () => {
    const s = withRecords(demo, {
      branchMergeRecords: [
        {
          ...demoMerge,
          fieldPlan: {
            ...fieldPlan,
            measurements: fieldPlan.measurements.map((m) => ({ ...m, onlySeparates: [] })),
          },
        },
      ],
    });
    expect(readout(s).ground?.checks.map(nextWords)).toEqual([
      "Herd numbers and routes by season.",
      "Orchard planting years.",
    ]);
  });

  it("binds the action whose checks are in the merge's field plan, not the latest action", () => {
    const later: BranchMerge = {
      ...demoMerge,
      id: "merge_later",
      commandId: "cmd_later",
      createdAt: "2030-01-01T00:00:00.000Z",
      fieldPlan: {
        measurements: [
          {
            fieldCheckId: "local_rain_records",
            label: "Local Rain Records",
            separates: [["grazing", "rainfall"]],
            onlySeparates: [["grazing", "rainfall"]],
          },
        ],
        unseparated: [],
      },
    };
    const g = readout(withRecords(demo, { branchMergeRecords: [demoMerge, later] })).ground;
    expect(g?.checks.map((c) => [c.fieldCheckId, c.what, c.drawn])).toEqual([
      ["local_rain_records", "Local Rain Records", false],
    ]);
    expect(g?.checks.map(nextWords)).toEqual([
      "Local rain records would tell rainfall from grazing.",
    ]);
    // nor the synthetic package's review requests: they belong to its plan
    expect(g?.reviews).toEqual([]);
  });

  it("lists only the reviews requested of the bound plan", () => {
    const action = only(
      demo.records.operationalActionRecords,
      (a) => a.fieldPlan !== undefined,
      "field plan action",
    );
    const review = only(demo.records.reviewDecisionRecords, () => true, "review");
    const s = withRecords(demo, {
      reviewDecisionRecords: [
        ...demo.records.reviewDecisionRecords,
        { ...review, id: "rev_other_action", actionId: "act_other" },
      ],
    });
    expect(readout(s).ground?.reviews.map((x) => x.id)).toEqual(action.reviewDecisionIds);
  });

  it("draws a check only when every stratum it names has a height range", () => {
    const { findings, bandLimit } = findingsFrom(demo, seedListing);
    const drawn = (snapshot: CaseSnapshot, limits: readonly [number, number] | null) =>
      readoutOf(snapshot, findings, bandLimit?.display ?? "", { limits }).ground?.checks.map(
        (c) => [c.place, c.drawn],
      );
    const keyed = (keys: readonly string[]) =>
      withRecords(demo, {
        operationalActionRecords: demo.records.operationalActionRecords.map((a) =>
          a.fieldPlan
            ? {
                ...a,
                fieldPlan: {
                  ...a.fieldPlan,
                  measurements: a.fieldPlan.measurements.map((m, i) =>
                    i === 0 ? { ...m, stratumKeys: [...keys] } : m,
                  ),
                },
              }
            : a,
        ),
      });
    const limits = bandLimitsOf(demo);
    expect(limits).not.toBeNull();
    expect(drawn(demo, limits)).toEqual([
      ["Upper elevation band", true],
      ["Valley-bottom fields and orchards", false],
    ]);
    // no band limits: nothing can be drawn
    expect(drawn(demo, null)?.map(([, d]) => d)).toEqual([false, false]);
    // limits left out: the record's own
    expect(
      readoutOf(demo, findings, bandLimit?.display ?? "").ground?.checks.map((c) => c.drawn),
    ).toEqual([true, false]);
    // a key with no height range beside one with a range
    expect(drawn(keyed(["elevation_high", "north_aspect"]), limits)?.[0]).toEqual([
      "Upper elevation band",
      false,
    ]);
    // two places named, one of them with no height range
    expect(drawn(keyed(["elevation_high", "valley_bottom_fields"]), limits)?.[0]).toEqual([
      "Upper elevation band and valley-bottom fields and orchards",
      false,
    ]);
    expect(drawn(keyed(["elevation_low", "elevation_high"]), limits)?.[0]?.[1]).toBe(true);
  });
});

describe("a follow-up request", () => {
  it("lists its own accepted and provisional findings, newest first, naming only the non-factual kinds", () => {
    const base = only(recorded.snapshot.records.taskRecords, () => true, "task");
    const task: Task = {
      ...base,
      id: "task_follow_up",
      commandId: "cmd_follow_up",
      kind: "source_research",
      question: "Which sources describe herding?",
    };
    const like = only(recorded.snapshot.records.evidenceRecords, () => true, "evidence");
    const evidence = (
      id: string,
      createdAt: string,
      status: Evidence["status"],
      claimKind: Evidence["claimKind"],
      statement: string,
    ): Evidence => ({
      ...like,
      id,
      createdAt,
      updatedAt: createdAt,
      status,
      claimKind,
      statement,
      provenance: { ...like.provenance, generatedByTaskId: task.id },
    });
    const asked = withRecords(recorded.snapshot, {
      taskRecords: [...recorded.snapshot.records.taskRecords, task],
      evidenceRecords: [
        ...recorded.snapshot.records.evidenceRecords,
        evidence(
          "ev_follow_older",
          "2026-11-01T10:00:00.000Z",
          "accepted",
          "observation",
          "The greenness was lowest in period_2022-04.",
        ),
        evidence(
          "ev_follow_newer",
          "2026-11-02T10:00:00.000Z",
          "provisional",
          "hypothesis",
          "Herds moved higher in spring.",
        ),
        evidence(
          "ev_follow_rejected",
          "2026-11-03T10:00:00.000Z",
          "rejected",
          "observation",
          "Rejected.",
        ),
        evidence("ev_follow_stale", "2026-11-03T11:00:00.000Z", "stale", "scenario", "Stale."),
      ],
    });
    const request = readout(asked, "cmd_follow_up").request;
    expect(request?.findings.map((f) => [f.id, f.claimKind])).toEqual([
      ["ev_follow_newer", "hypothesis"],
      ["ev_follow_older", "observation"],
    ]);
    expect(request?.findings.map(findingWords)).toEqual([
      "Hypothesis: Herds moved higher in spring.",
      "The greenness was lowest in April 2022.",
    ]);
    expect(findingWords({ text: "Grazing doubles.", claimKind: "scenario" })).toBe(
      "Scenario: Grazing doubles.",
    );
    expect(readout(asked, "cmd_not_in_the_record").request).toEqual({
      commandId: "cmd_not_in_the_record",
      findings: [],
    });
    expect(readout(asked).request).toBeNull();
    expect(readout(asked, null).request).toBeNull();
  });

  it("shows its first findings and one row for the rest, then every finding and a row to show fewer", () => {
    const findings = readout(recorded.snapshot, recorded.commandId).request?.findings ?? [];
    expect(findings.length).toBeGreaterThan(3);
    // collapsed: the first two in the order the record dates them, and the row that names how many there are
    expect(followUpOf(findings, false)).toEqual({
      shown: findings.slice(0, 2),
      toggle: `Show all ${String(findings.length)} findings`,
    });
    // expanded: every finding, and the row that folds them back
    expect(followUpOf(findings, true)).toEqual({ shown: findings, toggle: "Show fewer" });
    // three or fewer: all of them and no row, either way, so a row never hides a single finding
    for (const all of [false, true]) {
      for (const n of [0, 1, 3]) {
        expect(followUpOf(findings.slice(0, n), all)).toEqual({
          shown: findings.slice(0, n),
          toggle: null,
        });
      }
    }
  });
});

describe("stratumRange", () => {
  const LIMITS = [2316.8, 2815.2] as const;

  it("gives each elevation band its heights between the record's two limits, as the land draws them", () => {
    expect(stratumRange("elevation_low", LIMITS)).toEqual({ lo: -1000, hi: 2316.8 });
    expect(stratumRange("elevation_mid", LIMITS)).toEqual({ lo: 2316.8, hi: 2815.2 });
    expect(stratumRange("elevation_high", LIMITS)).toEqual({ lo: 2815.2, hi: 9000 });
  });

  it("gives no range to any other stratum, or without the limits", () => {
    expect(stratumRange("valley_bottom_fields", LIMITS)).toBeNull();
    expect(stratumRange("aspect_high", LIMITS)).toBeNull();
    expect(stratumRange("catchment", LIMITS)).toBeNull();
    expect(stratumRange("elevation_high", null)).toBeNull();
  });
});

describe("words", () => {
  it("writes a check's own description in sentence case, keeping acronyms and figures", () => {
    expect(sentenceCase("Local Rain Records")).toBe("Local rain records");
    expect(sentenceCase("Herd numbers and routes by season")).toBe(
      "Herd numbers and routes by season",
    );
    expect(sentenceCase("MODIS Scene Inspection")).toBe("MODIS scene inspection");
    expect(sentenceCase("orchard Planting In 2019")).toBe("Orchard planting in 2019");
    expect(sentenceCase("Valley-Bottom Fields")).toBe("Valley-bottom fields");
  });

  it("joins labels as a sentence, keeping acronyms and starting with a capital", () => {
    expect(joinLabels(["Grazing", "Land use", "MODIS artefact"])).toBe(
      "Grazing, land use and MODIS artefact",
    );
    expect(joinLabels(["Grazing"], false)).toBe("grazing");
    expect(joinLabels(["grazing", "land use"])).toBe("Grazing and land use");
  });

  it("shows period ids as dates and leaves every other word as written", () => {
    expect(datedText("0 of 2 stored values are negative (ndvi_x) over period_2022-04.")).toBe(
      "0 of 2 stored values are negative (ndvi_x) over April 2022.",
    );
  });

  it("shows a period id with an invalid month as written, never as January", () => {
    expect(periodIdWords("period_2022-13")).toBe("period_2022-13");
    expect(periodIdWords("period_2022-00")).toBe("period_2022-00");
    expect(periodIdWords("period_2022-12")).toBe("December 2022");
    expect(seasonIdWords("season_2021-13_2022-04")).toBeNull();
    expect(datedText("over period_2022-13 and season_2021-13_2022-04")).toBe(
      "over period_2022-13 and season_2021-13_2022-04",
    );
  });
});
