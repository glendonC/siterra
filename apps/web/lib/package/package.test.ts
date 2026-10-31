import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import {
  SYNTHETIC_IDS,
  SYNTHETIC_NOTE,
  withSyntheticPackage,
  type RecordedRun,
} from "./fixtures/synthetic";
import { commandBrief, FIELD_CHECK_LINKS_SHOWN, packageView, placesOnLand } from "./package";

// The recorded 28 Oct run (a test input) and the synthetic package written on it (fixtures/synthetic.ts).
const run = (
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

const now = withSyntheticPackage(seed, run);

describe("the synthetic package fixture", () => {
  it("is a case snapshot the contract accepts", () => {
    const parsed = CaseSnapshot.safeParse(now.snapshot);
    expect(parsed.error?.issues.slice(0, 3) ?? []).toEqual([]);
  });

  it("labels every record it adds as synthetic", () => {
    const b = now.snapshot.records.briefRecords[0];
    expect(b?.limitations).toContain(SYNTHETIC_NOTE);
    expect(b?.mode).toBe("replay");
    for (const r of [
      ...now.snapshot.records.interventionRecords,
      ...now.snapshot.records.resourceRequirementRecords,
    ])
      expect(r.provenance.limitations).toContain(SYNTHETIC_NOTE);
  });
});

describe("commandBrief", () => {
  it("finds the brief the command's tasks committed", () => {
    expect(commandBrief(now.snapshot, now.commandId)?.id).toBe(SYNTHETIC_IDS.brief);
  });

  it("finds none for another command or the bare seed", () => {
    expect(commandBrief(now.snapshot, "cmd_other")).toBeUndefined();
    expect(commandBrief(seed, now.commandId)).toBeUndefined();
  });
});

describe("packageView", () => {
  const view = packageView(now.snapshot, now.briefId);
  if (!view) throw new Error("no view");

  it("is undefined for a brief the record does not hold", () => {
    expect(packageView(now.snapshot, "brief_missing")).toBeUndefined();
  });

  it("keeps the brief's sections, lines and claim kinds as recorded", () => {
    expect(view.known.map((l) => l.claimKind)).toEqual([
      "observation",
      "scientific_context",
      "scientific_context",
    ]);
    expect(view.uncertain).toHaveLength(2);
    expect(view.measureNext).toHaveLength(2);
    expect(view.prepared).toHaveLength(3);
    expect(view.authorization).toHaveLength(3);
    expect(view.status).toBe("ready_for_review");
    expect(view.actionStatus).toBe("awaiting_review");
    expect(view.mode).toBe("replay");
  });

  it("numbers sources in reading order: bundle, then each study once", () => {
    // known: the observation's bundle (or measurement), SCI-19, SCI-03
    expect(view.known.map((l) => l.chips)).toEqual([[1], [2], [3]]);
    expect(view.sources).toHaveLength(3);
    // the gaps rest on the same two studies, so they reuse their numbers
    expect(view.measureNext.map((l) => l.chips)).toEqual([[2], [3]]);
    expect(view.sources[1]?.note).toContain("ES-2011-4429.pdf, page 2");
  });

  it("gives every brief line at least one chip", () => {
    for (const l of [
      ...view.known,
      ...view.uncertain,
      ...view.measureNext,
      ...view.involve,
      ...view.prepared,
      ...view.authorization,
      ...view.nextSteps,
    ])
      expect(l.chips.length, l.text).toBeGreaterThan(0);
  });

  it("ties a kind of place to the land only where its record names a bundle of the case", () => {
    const [herd, orchard] = view.measures;
    expect(herd?.places.map((p) => [p.key, p.bundleId])).toEqual([
      ["elevation_high", "bundle_terrain_strata_ait_bouguemez"],
    ]);
    expect(orchard?.places.map((p) => [p.key, p.bundleId])).toEqual([
      ["valley_bottom_fields", null],
    ]);
    expect(placesOnLand(view).map((p) => p.key)).toEqual(["elevation_high"]);
  });

  it("hides the field check link until its fit is checked", () => {
    expect(FIELD_CHECK_LINKS_SHOWN).toBe(false);
    expect(view.measures.map((m) => m.fieldCheck)).toEqual([null, null]);
  });

  it("names the field check each measurement's record names, with the merge's label, when links are shown", () => {
    const linked = packageView(now.snapshot, now.briefId, { fieldCheckLinks: true });
    expect(linked?.measures.map((m) => m.fieldCheck)).toEqual([
      { id: "herd_records", label: "Herd Records" },
      { id: "orchard_history", label: "Orchard History" },
    ]);
  });

  it("answers each measurement with the gap statements it resolves", () => {
    expect(view.measures[0]?.answers[0]).toMatch(/^Herd numbers and routes by season/);
  });

  it("holds the candidate responses in the brief's order, none ranked", () => {
    expect(view.responses.map((r) => r.title)).toEqual([
      "Seasonal rest set by the existing pasture institution",
      "Map orchard planting against the greening cells",
      "Defer until the field check",
    ]);
    expect(view.responses[0]?.assumptions).toHaveLength(1);
    expect(view.responses[0]?.reviewRoles).toEqual(["community_livelihood", "scientific"]);
  });

  it("states resources with no amount where the record holds none", () => {
    expect(view.resources).toHaveLength(5);
    expect(view.resources.every((r) => r.amount === null && r.estimate === "unknown")).toBe(true);
  });

  it("states reviews as requested, with no authority established", () => {
    expect(view.reviews).toEqual([
      { role: "community_livelihood", status: "requested", authorityEstablished: false },
      { role: "scientific", status: "requested", authorityEstablished: false },
    ]);
  });

  it("keeps the plan's permissions and the action's open conditions", () => {
    expect(view.beforeFieldWork).toHaveLength(3);
    expect(view.remainingConditions.at(-1)).toMatch(/nothing is sent, scheduled or authorized/);
  });

  it("reads a source's bare code as its short citation, never the code", () => {
    expect(view.known[1]?.text).toMatch(/^Auclair et al\. 2011 describes the upper parts/);
    expect(JSON.stringify(view)).not.toMatch(/\bSCI-[0-9]+/);
  });

  it("names no record id in any line it shows", () => {
    const shown = JSON.stringify({
      ...view,
      briefId: "",
      actionId: "",
      sources: [],
      resources: [],
      responses: view.responses.map((r) => ({ ...r, id: "" })),
    });
    expect(shown).not.toMatch(/\b(?:ev|src|int|res|act|brief|rev|task)_[A-Za-z0-9]/);
  });
});
