import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot, Evidence } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed, seedListing } from "../instruments/seed-listing";
import { bandLimitsOf } from "../land/record";
import { findingsFrom } from "../overview/findings";
import { withSyntheticPackage, type RecordedRun } from "../package/fixtures/synthetic";
import { readoutOf } from "../readout/readout";
import {
  caseFindings,
  chosenFindings,
  versionOf,
  viewKeyOf,
  type CaseFinding,
  type ColumnParts,
  type ViewLeads,
} from "./findings";

// The case's findings a typed question is answered from, on the demo case (the seed with the recorded 28 Oct run and
// the synthetic package, as the answer column reads it at the overview's home). Each finding is worded as the column
// or its view words it and keyed by the one record it is built from; the column reads a task's choice back by those
// keys.

const run28 = (
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        ...["..", "..", "..", "..", "packages", "contracts", "fixtures"],
        "recorded-live-run-2026-10-28-branch-merge.json",
      ),
      "utf8",
    ),
  ) as { records: RecordedRun }
).records;
const demo = withSyntheticPackage(seed, run28).snapshot;

/** The column's parts as the answer column builds them from one record. */
function columnOf(snapshot: CaseSnapshot): ColumnParts {
  const r = readoutOf(snapshot, findingsFrom(snapshot, seedListing).findings, "", {
    limits: bandLimitsOf(snapshot),
  });
  return {
    answer: r.answer,
    verdicts: r.verdicts,
    checks: r.ground?.checks ?? [],
    mergeId: r.mergeId,
  };
}

/** The views' leads as lib/ask/leads.ts reads them for this place (leads.test.ts). */
const LEADS: ViewLeads = {
  cutaway: [
    "Greenness (NDVI) rose most below 2,317 m",
    "Averaged over the whole catchment, all three bands got greener, each by more than its margin of error.",
  ],
  pixel: [
    "This pixel got greener from 2000 to 2025.",
    "Trees and fields cover 46% of it. More trees or fields alone would make it look greener, even if its grassland did not change.",
  ],
  rainfall: [
    "Year to year, March to June greenness follows September to May rainfall only weakly.",
  ],
  time: ["Of the pixels that stepped up to greener, half did so by 2011."],
};

const rows = (list: readonly CaseFinding[]) =>
  list.map((f) => [
    f.key.entityId,
    f.place.kind === "view" ? `view ${f.place.view}` : f.place.kind,
    f.place.kind === "source" ? f.place.source : null,
    f.lines.join(" / "),
  ]);

const withRecords = (
  snapshot: CaseSnapshot,
  records: Partial<CaseSnapshot["records"]>,
): CaseSnapshot => ({ ...snapshot, records: { ...snapshot.records, ...records } });

describe("the case's findings", () => {
  const list = caseFindings(demo, columnOf(demo), LEADS);

  it("lists what the case says, in the column's order and words, each keyed by the record it is built from", () => {
    expect(rows(list)).toEqual([
      [
        "meas_pixel_trend_upward_fdr_share_catchment_mar_jun",
        "answer",
        null,
        "Since 2000, 24.7% of the area has greened and 0.1% has browned.",
      ],
      [
        "branch_24245a4638d96cb6ddb63e3129b8f16c",
        "verdict",
        null,
        "Not enough data yet on grazing.",
      ],
      [
        "branch_2e644db8b0253777d22af9404bbe5b19",
        "verdict",
        null,
        "Not enough data yet on land use.",
      ],
      [
        "branch_28f4989969ac703dc6070f1cc5a7abd3",
        "verdict",
        null,
        "Not enough data yet on snow or terrain.",
      ],
      [
        "branch_338b5acb3a5443b5e287905d70032a91",
        "verdict",
        null,
        "Rainfall does not fit the evidence.",
      ],
      [
        "branch_0560fcb09af571c087d17ec3059b2ddf",
        "verdict",
        null,
        "Data artefact does not fit the evidence.",
      ],
      [
        "ev_synthetic_need_herd_records",
        "next",
        null,
        "Herd numbers and routes by season would tell grazing from snow or terrain.",
      ],
      [
        "ev_synthetic_need_orchard_history",
        "next",
        null,
        "Orchard planting years would tell land use from snow or terrain.",
      ],
      ["inst_cross_section_valley", "view cutaway", null, LEADS.cutaway?.join(" / ")],
      ["inst_pixel_anatomy_valley", "view pixel", null, LEADS.pixel?.join(" / ")],
      ["inst_rainfall_scatter_valley", "view rainfall", null, LEADS.rainfall?.join(" / ")],
      ["bundle_pixel_seasons_ait_bouguemez", "view time", null, LEADS.time?.join(" / ")],
      [
        "ev_valley_bottom_cultivated_sci03",
        "source",
        "El Aayadi et al. 2026; Auclair et al. 2011",
        "Irrigated valley floor, about 1,800 to 2,200 m, with more than thirty villages.",
      ],
      [
        "ev_upper_rangelands_vegetation_sci19",
        "source",
        "Auclair et al. 2011",
        "Upper rangelands: mainly spiny xerophytic vegetation and reduced areas of short grasslands.",
      ],
      [
        "ev_herder_reported_species_change_sci03",
        "source",
        "El Aayadi et al. 2026",
        "Herders report losing palatable species (Astragalus armatus, Thymus satureioides) and the spread of unpalatable plants (Thymelaea virgata, Euphorbia nicaeensis).",
      ],
      [
        "ev_01M623GYP16Y6YKSKYD6HX7798",
        "source",
        "Catchment NDVI, Sentinel-2 monthly",
        "The catchment NDVI area median was 0.1439 in April 2022.",
      ],
    ]);
  });

  it("keys no two findings by one record, each at the revision the case holds", () => {
    const keys = list.map((f) => f.key.entityId);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of list) expect(versionOf(demo, f.key.entityId)).toEqual(f.key);
  });

  it("says each thing once: a statement two views place is listed once", () => {
    const texts = list.map((f) => f.lines.join(" "));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("offers no view whose lead was not read, and keys the rest the same", () => {
    const without = caseFindings(demo, columnOf(demo), {});
    expect(without.some((f) => f.place.kind === "view")).toBe(false);
    expect(without.map((f) => f.key)).toEqual(
      list.filter((f) => f.place.kind !== "view").map((f) => f.key),
    );
  });

  it("never offers a follow-up's own evidence, a statement as a record words it before review, or a gap", () => {
    const like = demo.records.evidenceRecords.find((e) => e.claimKind === "scientific_context");
    if (!like) throw new Error("the demo case holds no study statement");
    const byFollowUp = (id: string, taskId: string): Evidence => ({
      ...like,
      id,
      status: "accepted",
      statement: `Accepted by ${taskId}.`,
      provenance: { ...like.provenance, generatedByTaskId: taskId },
    });
    const asked = withRecords(demo, {
      evidenceRecords: [
        ...demo.records.evidenceRecords,
        byFollowUp("ev_llm_abc123_1", "task_cmd_abc123"),
        byFollowUp("ev_ask_abc123_1", "task_ask_abc123"),
      ],
    });
    const words = caseFindings(asked, columnOf(asked), LEADS).flatMap((f) => f.lines);
    expect(words.filter((w) => w.startsWith("Accepted by"))).toEqual([]);
    // the record's own wording of a study ("SCI-19 says ...") and a gap's wording are not offered
    expect(words.filter((w) => /\bSCI-\d+\b/.test(w) || /must be checked locally/.test(w))).toEqual(
      [],
    );
  });

  it("keys an answer made of verdicts by the merge", () => {
    const unmeasured = withRecords(demo, {
      measurementRecords: demo.records.measurementRecords.filter(
        (m) => !/^area_share_(?:upward|downward)_fdr$/.test(m.metric),
      ),
    });
    const column = columnOf(unmeasured);
    const [answer] = caseFindings(unmeasured, column, {});
    expect(column.answer.claimKind).toBe("status");
    expect(answer?.place).toEqual({ kind: "answer" });
    expect(answer?.key.entityId).toBe(column.mergeId);
    expect(answer?.lines).toEqual([column.answer.claim]);
  });
});

describe("a follow-up's chosen findings", () => {
  const column = columnOf(demo);
  const version = (id: string) => {
    const v = versionOf(demo, id);
    if (!v) throw new Error(`the demo case holds no ${id}`);
    return v;
  };

  it("reads the task's records back as the findings they key, in its order; a view's lead is read apart", () => {
    const rain = version("inst_rainfall_scatter_valley");
    const verdict = version("branch_338b5acb3a5443b5e287905d70032a91");
    expect(chosenFindings(demo, column, [rain, verdict])).toEqual([
      { key: rain, lines: null, place: { kind: "view", view: "rainfall" } },
      { key: verdict, lines: ["Rainfall does not fit the evidence."], place: { kind: "verdict" } },
    ]);
    expect(viewKeyOf(demo, "rainfall")).toBe(rain.entityId);
  });

  it("drops a record that has moved on since it was chosen, and one that keys no finding", () => {
    const verdict = version("branch_338b5acb3a5443b5e287905d70032a91");
    const herd = version("ev_synthetic_need_herd_records");
    expect(
      chosenFindings(demo, column, [
        { ...verdict, revision: verdict.revision - 1 },
        version("src_SCI-03"),
        { entityId: "ev_not_in_the_case", revision: 1 },
        herd,
      ]).map((f) => f.lines),
    ).toEqual([["Herd numbers and routes by season would tell grazing from snow or terrain."]]);
  });
});
