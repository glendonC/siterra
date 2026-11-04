import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { pkg } from "../copy/package";
import { seed } from "../instruments/seed-listing";
import {
  SYNTHETIC_IDS,
  SYNTHETIC_NOTE,
  withSyntheticPackage,
  type RecordedRun,
} from "./fixtures/synthetic";
import { HOST_TEXT } from "./host-text";
import {
  commandBrief,
  FIELD_CHECK_LINKS_SHOWN,
  lociWords,
  locusOf,
  packageView,
  placesOnLand,
  plainLine,
} from "./package";

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
    expect(view.uncertain.map((l) => l.claimKind)).toEqual(["hypothesis", "field_requirement"]);
    expect(view.prepared).toHaveLength(3);
    expect(view.status).toBe("ready_for_review");
    expect(view.actionStatus).toBe("awaiting_review");
    expect(view.mode).toBe("replay");
  });

  it("shows each line once, under the first part that states it", () => {
    // the plan's two permissions open "Before Field Work"; the brief's authorization lines repeat them
    expect(view.beforeFieldWork).toHaveLength(3);
    expect(view.authorization.map((l) => l.text)).toEqual([
      "Any field work at all: Siterra's role ends at this draft.",
    ]);
    // the action's conditions repeat the permissions and the meeting: only what no earlier part says is left
    expect(view.remainingConditions).toEqual([pkg["package.host.noAuthority"].text]);
    const all = [
      ...view.known,
      ...view.uncertain,
      ...view.prepared,
      ...view.authorization,
      ...view.involve,
      ...view.nextSteps,
    ].map((l) => l.text);
    const plain = [...view.beforeFieldWork, ...view.remainingConditions, ...view.limitations];
    expect(new Set([...all, ...plain]).size).toBe(all.length + plain.length);
  });

  it("lets the plan's table stand for the brief's measurement lines, which return only without it", () => {
    expect(view.measures).toHaveLength(2);
    expect(view.measureNext).toEqual([]);
    const noTable = {
      ...now.snapshot,
      records: {
        ...now.snapshot.records,
        operationalActionRecords: now.snapshot.records.operationalActionRecords.map((a) =>
          a.fieldPlan ? { ...a, fieldPlan: { ...a.fieldPlan, measurements: [] } } : a,
        ),
      },
    };
    const lines = packageView(noTable, now.briefId)?.measureNext;
    expect(lines?.map((l) => l.text)).toEqual([
      "Herd numbers and routes by season, to tell grazing apart from snow and terrain.",
      "Orchard planting years, to tell land use apart from snow and terrain.",
    ]);
    expect(lines?.map((l) => l.chips)).toEqual([[2], [3]]);
  });

  it("numbers sources in reading order: bundle, then each study once", () => {
    // known: the observation's bundle (or measurement), SCI-19, SCI-03
    expect(view.known.map((l) => l.chips)).toEqual([[1], [2], [3]]);
    expect(view.sources).toHaveLength(3);
    // the measurements rest on the same two studies, so they reuse their numbers
    expect(view.measures.map((m) => m.chips)).toEqual([[2], [3]]);
  });

  it("lists a study by its title and link, then its authors, venue and pages, never a file name", () => {
    const study = now.snapshot.records.sourceRecords.find((s) => s.id === "src_SCI-19");
    expect(view.sources[1]).toEqual({
      n: 2,
      key: "src_SCI-19",
      title: study?.title,
      href: study?.url,
      detail: ["Auclair et al. 2011", study?.publisher, "page 2"],
    });
    expect(JSON.stringify(view.sources)).not.toMatch(/\.pdf\b/);
    // the observation's data: its name and its credit as the record writes it, with no link to invent
    const bundle = now.snapshot.records.dataBundleRecords.find(
      (b) => b.id === view.sources[0]?.key,
    );
    expect(view.sources[0]?.title).toBe(bundle?.label);
    expect(view.sources[0]?.href).toBeNull();
    expect(view.sources[0]?.detail).toEqual(bundle?.attribution ? [bundle.attribution] : []);
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

  it("shows the field check link the record keeps, now that its fit is checked (P9d)", () => {
    expect(FIELD_CHECK_LINKS_SHOWN).toBe(true);
    expect(view.measures.map((m) => m.fieldCheck?.id ?? null)).toEqual([
      "herd_records",
      "orchard_history",
    ]);
    const hidden = packageView(now.snapshot, now.briefId, { fieldCheckLinks: false });
    expect(hidden?.measures.map((m) => m.fieldCheck)).toEqual([null, null]);
  });

  it("names the field check each measurement's record names, with the merge's label, when links are shown", () => {
    const linked = packageView(now.snapshot, now.briefId, { fieldCheckLinks: true });
    expect(linked?.measures.map((m) => m.fieldCheck)).toEqual([
      { id: "herd_records", label: "Herd Records" },
      { id: "orchard_history", label: "Orchard History" },
    ]);
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

  it("leaves the nothing-sent sentence to the brief's head, and says the synthetic note in plain words", () => {
    expect(JSON.stringify(view)).not.toMatch(/nothing is sent|scheduled or authori[sz]ed/i);
    expect(view.limitations).toEqual([pkg["package.host.synthetic"].text]);
    // the brief's mode is a record field the page does not show
    expect(JSON.stringify({ ...view, mode: "" })).not.toMatch(/fixture|record shapes|replay/i);
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

describe("plainLine", () => {
  it("says host code's fixed sentences in catalog words, and drops the draft line the head says", () => {
    expect(plainLine(HOST_TEXT.briefDraft)).toBeNull();
    expect(plainLine(HOST_TEXT.noAuthority)).toBe(pkg["package.host.noAuthority"].text);
    expect(plainLine(HOST_TEXT.synthetic)).toBe(pkg["package.host.synthetic"].text);
    expect(plainLine(HOST_TEXT.replaySynthetic)).toBe(pkg["package.host.replaySynthetic"].text);
    expect(plainLine(HOST_TEXT.replayRecorded)).toBe(pkg["package.host.replayRecorded"].text);
    expect(plainLine(` ${HOST_TEXT.noAuthority} `)).toBe(pkg["package.host.noAuthority"].text);
  });

  it("keeps any other line as recorded", () => {
    const own = "No candidate response is cited, so the plan is not ready for review.";
    expect(plainLine(own)).toBe(own);
  });
});

describe("locusOf", () => {
  it("keeps where in a source a locator points, without the file it was read from", () => {
    expect(locusOf("ES-2011-4429.pdf, page 2")).toBe("page 2");
    expect(locusOf("s42055-026-00126-4.pdf, page 5")).toBe("page 5");
    expect(locusOf("Table 2, p. 7")).toBe("Table 2, p. 7");
    expect(locusOf("annex.pdf p. 3")).toBe("p. 3");
    expect(locusOf("https://example.org/report.html, section 4")).toBe("section 4");
    expect(locusOf("ES-2011-4429.pdf")).toBe("");
  });
});

describe("lociWords", () => {
  it("reads several pages of one study as one, and any other kind of place as recorded", () => {
    expect(lociWords(["page 5", "page 7", "page 8"])).toEqual(["pages 5, 7, 8"]);
    expect(lociWords(["p. 5", "page 7"])).toEqual(["pages 5, 7"]);
    expect(lociWords(["page 2"])).toEqual(["page 2"]);
    expect(lociWords(["page 5", "Table 2"])).toEqual(["page 5", "Table 2"]);
    expect(lociWords([])).toEqual([]);
  });
});
