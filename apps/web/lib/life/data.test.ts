import { describe, expect, it } from "vitest";
import { groupOf, occurrencesFrom, pointsOf, summaryOf } from "./data";
import { syntheticOccurrences } from "./fixtures/occurrences";

// a small asset in the stored shape (species_occurrences 1.0.0): two records on one point, one on another
const asset = {
  recipeId: "species_occurrences",
  version: "1.0.0",
  computed: "2026-10-30T20:23:52Z",
  records: 3,
  tables: {
    taxa: [
      {
        scientific_name: "Apus apus (Linnaeus, 1758)",
        species: "Apus apus",
        kingdom: "Animalia",
        class: "Aves",
      },
      { scientific_name: "Thymus L.", species: null, kingdom: "Plantae", class: "Magnoliopsida" },
    ],
    datasets: [{ key: "k", title: "A dataset", publisher: "A publisher", doi: "10.0/x" }],
    basis_of_record: ["HUMAN_OBSERVATION", "FOSSIL_SPECIMEN"],
    license: ["CC-BY-4.0", "CC0-1.0"],
  },
  columns: {
    gbif_id: [1, 2, 3],
    taxon: [0, 1, 0],
    year: [2012, null, 2019],
    event_date: ["2012-04-04", null, "2019-05"],
    basis_of_record: [0, 1, 0],
    lat: [31.65, 31.65, 31.6],
    lon: [-6.45, -6.45, -6.5],
    uncertainty_m: [null, 1500, 30],
    dataset: [0, 0, 0],
    license: [0, 1, 0],
  },
};

describe("occurrencesFrom", () => {
  it("reads each kept record through the asset's tables", () => {
    const o = occurrencesFrom(asset);
    expect(o.records).toHaveLength(3);
    expect(o.records[1]).toMatchObject({
      basis: "FOSSIL_SPECIMEN",
      license: "CC0-1.0",
      year: null,
      uncertaintyM: 1500,
    });
    expect(o.taxa.map((t) => t.group)).toEqual(["bird", "plant"]);
  });

  it("refuses an asset whose columns and record count differ, or whose index leaves its table", () => {
    expect(() => occurrencesFrom({ ...asset, records: 4 })).toThrow(/record count/);
    expect(() =>
      occurrencesFrom({ ...asset, columns: { ...asset.columns, taxon: [0, 1, 7] } }),
    ).toThrow(/taxon index/);
    expect(() => occurrencesFrom({ ...asset, recipeId: "other" })).toThrow();
  });
});

describe("pointsOf", () => {
  it("makes one point per recorded coordinate, never one per record, and leaves fossil specimens off the land", () => {
    const o = occurrencesFrom(asset);
    const pts = pointsOf(o, 29);
    expect(pts.map((p) => p.records)).toEqual([[0], [2]]);
    const [first, one] = pts;
    expect(first).toMatchObject({
      group: "bird",
      species: 1,
      years: [2012, 2012],
      uncertaintyM: null,
      unstated: 1,
    });
    expect(one).toMatchObject({
      group: "bird",
      species: 1,
      years: [2019, 2019],
      uncertaintyM: 30,
      unstated: 0,
    });
    // in the zone's metres: UTM 29 north puts the valley near 457 km east, 3,502 km north
    expect(one?.e).toBeGreaterThan(400_000);
    expect(one?.n).toBeGreaterThan(3_400_000);
    expect(summaryOf(o, pts)).toEqual({ records: 2, points: 2, fossils: 1, years: [2012, 2019] });
  });

  it("marks a point of several groups as mixed, with its largest stated uncertainty", () => {
    const o = occurrencesFrom({
      ...asset,
      tables: { ...asset.tables, basis_of_record: ["HUMAN_OBSERVATION", "PRESERVED_SPECIMEN"] },
    });
    const [mixed] = pointsOf(o, 29);
    expect(mixed).toMatchObject({
      records: [0, 1],
      group: null,
      species: 2,
      uncertaintyM: 1500,
      unstated: 1,
    });
  });
});

describe("groupOf", () => {
  it("names a glyph's group from the record's kingdom and class only", () => {
    expect(groupOf("Animalia", "Insecta")).toBe("insect");
    expect(groupOf("Animalia", "Mammalia")).toBe("other");
    expect(groupOf("Fungi", null)).toBe("other");
  });
});

describe("the synthetic fixture", () => {
  it("is read like the stored asset: six points, the fossil specimen off the land", () => {
    const o = occurrencesFrom(syntheticOccurrences);
    const pts = pointsOf(o, 29);
    expect(pts).toHaveLength(6);
    expect(pts[0]).toMatchObject({
      group: null,
      species: 4,
      years: [2012, 2021],
      uncertaintyM: 30,
    });
    expect(summaryOf(o, pts)).toEqual({ records: 12, points: 6, fossils: 1, years: [1936, 2025] });
  });
});
