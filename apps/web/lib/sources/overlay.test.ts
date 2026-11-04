import { fileURLToPath } from "node:url";
import type { CaseSnapshot } from "@siterra/contracts";
import { readCaseSeed, seedSnapshot } from "@siterra/db";
import { describe, expect, it } from "vitest";
import { sc } from "../copy/sources";
import { linesSaying, withoutIds } from "./limits";
import { creditsIn, overlayView, type OverlayView } from "./overlay";

// The overlay from each seed case's record as GET /api/cases/:id returns it right after seeding (packages/db,
// seedSnapshot): one place with published context, one without; and the first after a run.

const repoDir = fileURLToPath(new URL("../../../../", import.meta.url));
const seedOf = (seedDir?: string): CaseSnapshot => {
  const r = readCaseSeed({
    repoDir,
    ...(seedDir ? { seedDir } : {}),
    mode: "concept",
    ownerScopeId: "seed",
    importedAt: "2026-10-30T12:00:00Z",
  });
  if (!r.seed) throw new Error(`seed not read: ${JSON.stringify(r.issues)}`);
  return seedSnapshot(r.seed);
};
const first = seedOf();
const second = seedOf("data/case/calaveras-creek");

/** Every limitation the case's records state. */
function stated(s: CaseSnapshot): string[] {
  const r = s.records;
  return [
    ...r.dataBundleRecords.flatMap((b) => b.provenance.limitations),
    ...r.measurementRecords.flatMap((m) => m.provenance.limitations),
    ...r.temporalObservationRecords.flatMap((o) => o.provenance.limitations),
    ...r.evidenceRecords.flatMap((e) => e.provenance.limitations),
    ...r.briefRecords.flatMap((b) => [...b.limitations, ...b.provenance.limitations]),
    ...r.geoSelectionRecords.flatMap((g) => g.limitations),
    ...r.hypothesisRecords.flatMap((x) => x.provenance.limitations),
    ...(r.explanationBranchRecords ?? []).flatMap((x) => x.provenance.limitations),
    ...(r.branchMergeRecords ?? []).flatMap((x) => x.provenance.limitations),
    ...r.interventionRecords.flatMap((x) => x.provenance.limitations),
    ...r.resourceRequirementRecords.flatMap((x) => x.provenance.limitations),
    ...(r.instrumentSpecRecords ?? []).flatMap((x) => x.provenance.limitations),
    ...(r.contextFeatureRecords ?? []).flatMap((f) => f.limitations),
  ];
}

const limitLines = (v: OverlayView) =>
  [...v.limits.side, ...v.limits.main].flatMap((s) => s.topics.flatMap((t) => t.lines));
const credits = (v: OverlayView) => [...v.datasets.flatMap((d) => d.credits), ...v.mapCredits];
const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** What only the record reads: a source ID, a rule ID, a method ID, a change log, and the record's own vocabulary. */
const RECORD_ONLY = [
  /\bSCI-\d+/,
  /@\d/,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/,
  /^Revision \d/,
  /\b(?:merge|status|branch|stale|revision|proposed|recorded|replay|composites?|claim kind|model estimates?|false discovery rate|host)\b/i,
  /synthetic fixture/i,
];

describe("Sources from the first seed case", () => {
  const view = overlayView(first);

  it("lists one row per dataset the case measured with, named with the version its bundles state", () => {
    expect(view.datasets.map((d) => [d.measured, d.name, d.detail])).toEqual([
      ["Greenness", "MODIS MOD13Q1 v6.1", "250 m, 2000 to 2025"],
      ["Greenness", "Sentinel-2 L2A", "10 m, 2019 to 2025"],
      ["Rainfall", "CHIRPS v3.0", "5 km, 2019 to 2025"],
      ["Land cover", "ESA WorldCover 2021", null],
      ["Elevation", "Copernicus DEM GLO-30 2021", "30 m, 2021"],
      ["Snow cover", "MODIS MOD10A1 v6.1", null],
      ["Species records", "GBIF occurrence search v1", "1864 to 2025"],
    ]);
  });

  it("puts each credit whole under the dataset it names, the licence's own notices kept", () => {
    const of = (id: string) => view.datasets.find((d) => d.datasetId === id)?.credits ?? [];
    expect(of("sentinel-2-l2a")).toEqual([
      "Contains modified Copernicus Sentinel data 2019-2025",
      "Legal notice on the use of Copernicus Sentinel data and service information",
    ]);
    expect(of("copernicus-dem-glo-30")).toEqual([
      "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
      "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30",
      "Catchment and strata derived by Siterra from Copernicus DEM GLO-30 (2021 release)",
      "Licence for Copernicus DEM instance COP-DEM-GLO-30-F Global 30m Full, Free & Open",
    ]);
    expect(of("esa-worldcover-v200")).toEqual([
      "© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
      "ESA WorldCover 10 m 2021 v200, Zanaga et al. (2022), https://doi.org/10.5281/zenodo.7254221, CC BY 4.0",
    ]);
    expect(of("CHIRPS-3.0-monthly-final")[0]).toMatch(/^CHIRPS v3\.0, Climate Hazards Center/);
    expect(of("modis-13Q1-061")[0]).toMatch(/^Didan, K\. \(2021\)\. .*MOD13Q1\.061/);
    // the occurrence search's credit with its two clauses, whole, and every occurrence dataset credited
    expect(of("gbif-occurrence-search")).toContain(
      "Occurrence records from GBIF.org (accessed 2026-10-30) through the GBIF occurrence search API; each record keeps the licence of its dataset (CC0 1.0 or CC BY 4.0); see https://www.gbif.org/citation-guidelines.",
    );
    expect(
      of("gbif-occurrence-search").filter((c) => c.includes("Accessed through GBIF.org")).length,
    ).toBeGreaterThan(10);
  });

  it("keeps every credit a credit: no fragment, no internal note, each once and none a part of another", () => {
    const all = credits(view);
    for (const c of all) {
      expect(c, c).toMatch(/[\p{Lu}\p{N}©]/u);
      expect(c, c).not.toMatch(
        /^(?:other|CC BY 4\.0)$|^the software\b|\.md\b|outlet input|private step|bundle|SCI-\d/i,
      );
    }
    expect(new Set(all.map((c) => c.toLowerCase())).size).toBe(all.length);
    const sets = all.map(words);
    sets.forEach((mine, i) => {
      const inside = sets.some((other, j) => j !== i && [...mine].every((w) => other.has(w)));
      expect(inside, all[i]).toBe(false);
    });
  });

  it("credits what the map draws that no dataset carries: the place names, a village's point, the outlet's input", () => {
    // feature by feature, a feature's licence after its credit
    expect(view.mapCredits).toEqual([
      "Aakairi, M. et al. (2026), People and Nature, CC BY 4.0",
      "© OpenStreetMap contributors",
      "ODbL-1.0 (OpenStreetMap)",
      "GeoNames, CC BY 4.0",
    ]);
  });

  it("links a dataset to the case's own page for it where no credit already does", () => {
    const link = (id: string) => view.datasets.find((d) => d.datasetId === id)?.link;
    expect(link("sentinel-2-l2a")).toEqual({
      title: "Sentinel-2 SR Harmonized (Earth Engine data catalog)",
      url: "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
    });
    // the rainfall and land cover pages are the DOIs their credits already link
    expect(link("CHIRPS-3.0-monthly-final")).toBeNull();
    expect(link("esa-worldcover-v200")).toBeNull();
  });

  it("lists every publication the case holds once, with its link, those the statements cite first", () => {
    const held = first.records.sourceRecords.filter((s) => s.sourceKind !== "official_dataset");
    expect(view.publications.map((p) => p.sourceId).sort()).toEqual(held.map((s) => s.id).sort());
    expect(view.publications.slice(0, 2)).toEqual([
      {
        sourceId: "src_SCI-19",
        cite: "Auclair, L., Baudot, P., Genin, D. et al. (2011)",
        title:
          "Patrimony for resilience: evidence from the forest agdal in the Moroccan High Atlas Mountains",
        venue: "Ecology and Society 16(4): 24",
        url: "https://doi.org/10.5751/ES-04429-160424",
      },
      {
        sourceId: "src_SCI-03",
        cite: "El Aayadi, S., Challioui, M. K., Sraïri, M. T. (2026)",
        title:
          "Adaptation strategies of mountain livestock systems to global changes in the Central High Atlas, Morocco",
        venue: "Sustainable Earth Reviews 9, article 7",
        url: "https://doi.org/10.1186/s42055-026-00126-4",
      },
    ]);
    // a publisher with no author named is the cite itself, not said twice
    expect(view.publications.find((p) => p.sourceId === "src_SCI-125")).toMatchObject({
      cite: "United Nations General Assembly (2022)",
      venue: null,
    });
    expect(view.lead).toEqual({
      ink: "Measured with 7 datasets.",
      grey: "Context from 13 publications.",
    });
  });
});

describe("Limits from the first seed case", () => {
  const view = overlayView(first);

  it("says every limitation the record states in plain words, none left in the record's own", () => {
    for (const line of stated(first)) expect(linesSaying(line).length, line).toBeGreaterThan(0);
    expect(
      [...view.limits.side, ...view.limits.main].flatMap((s) => s.topics).map((t) => t.label),
    ).not.toContain(null);
  });

  it("groups them under four headings, each topic once, beside and in the main column", () => {
    expect(view.limits.side.map((s) => s.heading)).toEqual([
      "What Siterra does not do",
      "What the map does not show",
    ]);
    expect(view.limits.main.map((s) => s.heading)).toEqual([
      "What the data cannot show",
      "What the analysis assumes",
    ]);
    const data = view.limits.main[0]?.topics.map((t) => t.label);
    expect(data).toEqual([
      "Coverage",
      "Greenness",
      "Satellite images",
      "Land cover",
      "Rainfall",
      "Snow cover",
      "Species records",
    ]);
    for (const s of [...view.limits.side, ...view.limits.main]) {
      const ids = s.topics.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("counts the months the measurements leave out in one line, with the policy every reason states", () => {
    const coverage = view.limits.main[0]?.topics[0]?.lines ?? [];
    expect(coverage[0]).toBe(
      "Sentinel-2 L2A is missing values for 28 of 84 months, all from December to March: less than 70% of the area could be used.",
    );
    expect(limitLines(view).filter((l) => /policy|Insufficient/.test(l))).toEqual([]);
  });

  it("says each thing once, with no ID, change log or word of the record's own", () => {
    const lines = limitLines(view);
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of lines) for (const re of RECORD_ONLY) expect(l, l).not.toMatch(re);
    // the same caveat the record repeats across its bundles is one line ("Terra's overpass has drifted ...")
    expect(lines.filter((l) => /Terra satellite/.test(l))).toHaveLength(1);
  });

  it("says the pictures the views draw are for display where the case offers those views", () => {
    const pictures = view.limits.side
      .find((s) => s.id === "map")
      ?.topics.find((t) => t.id === "pictures");
    expect(pictures?.lines).toContain(sc["sources.limits.pixelPicture"].text);
    // Year by Year plays the snow with the greenness here, so its note says both
    expect(pictures?.lines).toContain(sc["sources.limits.timeBlendSnow"].text);
    expect(pictures?.lines).not.toContain(sc["sources.limits.timeBlend"].text);
  });
});

describe("the overlay from the second seed case", () => {
  const view = overlayView(second);

  it("reads its own datasets, credits and publications, with nothing left out of its coverage", () => {
    expect(view.datasets.map((d) => d.name)).toEqual([
      "MODIS MOD13Q1 v6.1",
      "Sentinel-2 L2A v05.11",
      "CHIRPS v3.0",
      "ESA WorldCover 2021",
      "Copernicus DEM GLO-30 2021",
      "MODIS MOD10A1 v6.1",
      "GBIF occurrence search v1",
    ]);
    expect(view.datasets.find((d) => d.datasetId === "gbif-occurrence-search")?.detail).toBe(
      "1875 to 2026",
    );
    // no place-name feature of its own, so no GeoNames line
    expect(credits(view)).not.toContain("GeoNames, CC BY 4.0");
    expect(view.lead).toEqual({
      ink: "Measured with 7 datasets.",
      grey: "Context from 6 publications.",
    });
    expect(view.limits.main[0]?.topics.map((t) => t.id)).not.toContain("coverage");
  });

  it("says Year by Year blends the greenness alone where the record says its snow was not run", () => {
    const lines = limitLines(view);
    expect(lines).toContain(sc["sources.limits.timeBlend"].text);
    expect(lines).not.toContain(sc["sources.limits.timeBlendSnow"].text);
  });

  it("says every limitation it states in plain words, with no ID or word of the record's own", () => {
    for (const line of stated(second)) expect(linesSaying(line).length, line).toBeGreaterThan(0);
    const lines = limitLines(view);
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of lines) for (const re of RECORD_ONLY) expect(l, l).not.toMatch(re);
  });
});

describe("the overlay from the first case after a run", () => {
  const base = first.records;
  const evidence = base.evidenceRecords.find((e) => e.id === "ev_valley_bottom_irrigated_sci19");
  const bundle = base.dataBundleRecords[0];
  if (!evidence || !bundle) throw new Error("seed records moved");
  // the run's records state these, word for word as the run writes them
  const RUN = [
    "Synthetic fixture for the interface: written by hand in the brief task's record shapes, not a model output and not a plan anyone made.",
    "Draft prepared by Siterra; nothing is sent, scheduled or authorized.",
    "A candidate response, not a recommendation; nothing is decided or authorized.",
    "No benefit, outcome or effect is estimated.",
    "A hypothesis is a candidate explanation; its status describes the evidence, not proof.",
    "Its status is the explanation branch's, set by fixed rules (merge@2) from host scores of predictions committed before any result was read.",
    "Scored by host code and set by the fixed merge rules (merge@2); the model wrote the wording only.",
    "A status describes the record against committed predictions; it is not a probability, a rank or proof.",
    "The explanation pairs each field check separates are set in the case configuration, not measured.",
    "Written from a synthetic replay, not a model output or a live model call.",
  ];
  const brief = {
    recordType: "Brief" as const,
    id: "brief_test",
    revision: 1,
    createdAt: evidence.createdAt,
    updatedAt: evidence.createdAt,
    caseId: first.case.id,
    title: "Test brief",
    status: "ready_for_review" as const,
    sourceCaseRevision: 1,
    evidenceIds: [evidence.id],
    hypothesisIds: [],
    interventionIds: [],
    actionIds: [],
    known: [
      {
        text: "A known line.",
        claimKind: "scientific_context" as const,
        evidenceIds: [evidence.id],
        measurementIds: [],
      },
    ],
    uncertain: [],
    nextMeasurements: [],
    stakeholderRoles: [],
    preparedActions: [],
    authorizationRequired: [],
    nextSteps: [],
    reviewDecisionIds: [],
    limitations: RUN,
    mode: "replay" as const,
    provenance: { ...evidence.provenance, limitations: [] },
  };
  const after: CaseSnapshot = {
    ...first,
    records: {
      ...base,
      briefRecords: [brief],
      // a statement replaced by a newer one no longer counts
      evidenceRecords: base.evidenceRecords.map((e) =>
        e.id === "ev_valley_villages_sci19" ? { ...e, status: "superseded" as const } : e,
      ),
      dataBundleRecords: [
        ...base.dataBundleRecords.map((b) =>
          b.id === bundle.id
            ? {
                ...b,
                provenance: {
                  ...b.provenance,
                  limitations: [
                    ...b.provenance.limitations,
                    "A caveat no plain line says, from a study (SCI-77, p. 3).",
                  ],
                },
              }
            : b,
        ),
        {
          ...bundle,
          id: "bundle_test_missing",
          status: "missing" as const,
          label: "Snow by month (snow_by_month 1.0.0)",
        },
      ],
    },
  };
  const view = overlayView(after);

  it("says what Siterra does not do in plain words, under its topics", () => {
    const app = view.limits.side.find((s) => s.id === "app");
    expect(app?.topics.map((t) => [t.label, t.lines.length])).toEqual([
      ["Brief", 2],
      ["Responses", 2],
      ["Explanations", 4],
      ["Studies", 1],
      ["Analysis steps", 1],
      ["Views", 1],
    ]);
    for (const l of app?.topics.flatMap((t) => t.lines) ?? [])
      for (const re of RECORD_ONLY) expect(l, l).not.toMatch(re);
  });

  it("keeps a caveat no plain line says in the record's words without its ID, and a missing bundle under coverage", () => {
    const data = view.limits.main.find((s) => s.id === "data");
    expect(data?.topics.at(-1)).toEqual({
      id: "record",
      label: null,
      lines: ["A caveat no plain line says, from a study."],
    });
    expect(data?.topics[0]?.lines).toContain("Snow by month: not available.");
  });

  it("counts a brief item citing a study's statement among the publications' order, not a superseded statement", () => {
    expect(view.publications[0]?.sourceId).toBe("src_SCI-19");
  });

  it("names a dataset it does not know by the record's own ID", () => {
    const other = overlayView({
      ...first,
      records: {
        ...base,
        dataBundleRecords: [
          { ...bundle, datasetId: "Some Other Archive", datasetVersion: "2024.12" },
        ],
        measurementRecords: [],
      },
    });
    expect(other.datasets.map((d) => [d.datasetId, d.measured, d.name, d.detail])).toEqual([
      ["Some Other Archive", "Data", "Some Other Archive 2024.12", null],
    ]);
    expect(other.lead.ink).toBe("Measured with 1 dataset.");
  });
});

describe("credits and limitations the record writes for itself", () => {
  it("cuts a credit field into whole credits", () => {
    expect(creditsIn("A credit © Someone 2020; all rights reserved; Another credit, 2021")).toEqual(
      ["A credit © Someone 2020; all rights reserved", "Another credit, 2021"],
    );
    // a name that starts in lower case starts a credit of its own
    expect(creditsIn("A credit. 2026.; iNaturalist.org. Observations. 2026.")).toEqual([
      "A credit. 2026.",
      "iNaturalist.org. Observations. 2026.",
    ]);
    // a "; " inside brackets stays with its credit
    expect(creditsIn("Guidance (data are CC0; citation urged)")).toEqual([
      "Guidance (data are CC0; citation urged)",
    ]);
  });

  it("drops what only the record reads from a credit", () => {
    expect(creditsIn("outlet input © OpenStreetMap contributors (hydrography context)")).toEqual([
      "© OpenStreetMap contributors",
    ]);
    expect(creditsIn("Copernicus DEM licence (data-sources-and-methods.md, terrain)")).toEqual([
      "Copernicus DEM licence",
    ]);
    expect(
      creditsIn(
        "Legal notice on the use of Copernicus Sentinel data and service information (SCI-18)",
      ),
    ).toEqual(["Legal notice on the use of Copernicus Sentinel data and service information"]);
    expect(
      creditsIn(
        "Catchment derived by Siterra; Flow conditioned by a private step that uses a tool (GPL-3.0); the software is not part of this bundle",
      ),
    ).toEqual(["Catchment derived by Siterra"]);
    expect(creditsIn("other")).toEqual([]);
  });

  it("keeps a limitation's words without its IDs when no plain line says it", () => {
    expect(withoutIds("A caveat (SCI-19, p. 2), and more (1800 to 2200 m, SCI-19).")).toBe(
      "A caveat, and more (1800 to 2200 m).",
    );
    expect(withoutIds("Set by fixed rules (merge@2) from scores.")).toBe(
      "Set by fixed rules from scores.",
    );
    expect(withoutIds("A slope. Its check is in pixel_trend_long_record.")).toBe("A slope.");
    expect(withoutIds("See some_method_id.")).toBeNull();
  });
});
