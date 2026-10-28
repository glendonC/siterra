import { describe, expect, it } from "vitest";

import { analysisConfigFor } from "./cases/index.ts";
import {
  MAX_COVER_CANDIDATES,
  coverIssues,
  minimumTestCover,
  openPairs,
  type CoverMeasurement,
} from "./test-cover.ts";

// DF-09: the field plan is the smallest set of field measurements that separates every pair of
// explanations the record leaves open; each one names a pair only it separates.

const m = (id: string, ...pairs: [string, string][]): CoverMeasurement => ({
  id,
  label: id,
  separates: pairs,
});

describe("open explanation pairs", () => {
  it("pairs every explanation the record does not contradict, in a canonical order", () => {
    expect(
      openPairs([
        { explanationId: "z", status: "consistent" },
        { explanationId: "x", status: "cannot_be_assessed" },
        { explanationId: "y", status: "contradicted" },
        { explanationId: "w", status: "consistent" },
      ]),
    ).toEqual([
      ["w", "x"],
      ["w", "z"],
      ["x", "z"],
    ]);
  });

  it("pairs a single standing explanation with the contradicted ones, and leaves nothing open when none stand", () => {
    expect(
      openPairs([
        { explanationId: "a", status: "contradicted" },
        { explanationId: "b", status: "cannot_be_assessed" },
      ]),
    ).toEqual([["a", "b"]]);
    expect(
      openPairs([
        { explanationId: "a", status: "contradicted" },
        { explanationId: "b", status: "contradicted" },
      ]),
    ).toEqual([]);
  });
});

describe("minimum test cover", () => {
  const open: [string, string][] = [
    ["x", "y"],
    ["x", "z"],
    ["y", "z"],
  ];

  it("finds the smallest separating set, taking the earliest in catalog order on a tie", () => {
    const catalog = [m("m1", ["x", "y"]), m("m2", ["y", "z"]), m("m3", ["y", "x"], ["x", "z"])];
    const withFourth = [...catalog, m("m4", ["z", "x"], ["z", "y"])];
    const cover = minimumTestCover(withFourth, open);
    expect(cover.measurements.map((c) => c.id)).toEqual(["m1", "m4"]);
    expect(cover.measurements).toEqual([
      { id: "m1", label: "m1", separates: [["x", "y"]], onlySeparates: [["x", "y"]] },
      {
        id: "m4",
        label: "m4",
        separates: [
          ["x", "z"],
          ["y", "z"],
        ],
        onlySeparates: [
          ["x", "z"],
          ["y", "z"],
        ],
      },
    ]);
    expect(cover.unseparated).toEqual([]);
    expect(coverIssues(cover, withFourth, open)).toEqual([]);
  });

  it("is exact: a greedy pick of the widest check first would need three", () => {
    const catalog = [
      m("wide", ["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]),
      m("left", ["a", "b"], ["c", "d"], ["i", "j"]),
      m("right", ["e", "f"], ["g", "h"], ["k", "l"]),
    ];
    const pairs = openPairsOf(catalog);
    expect(minimumTestCover(catalog, pairs).measurements.map((c) => c.id)).toEqual([
      "left",
      "right",
    ]);
  });

  it("names the open pairs no catalog check separates and ignores pairs the record closed", () => {
    const catalog = [m("closed_only", ["x", "w"]), m("m1", ["x", "y"])];
    const cover = minimumTestCover(catalog, open);
    expect(cover.measurements.map((c) => c.id)).toEqual(["m1"]);
    expect(cover.unseparated).toEqual([
      ["x", "z"],
      ["y", "z"],
    ]);
    expect(coverIssues(cover, catalog, open)).toEqual([]);
  });

  it("is empty when nothing is open", () => {
    expect(minimumTestCover([m("m1", ["x", "y"])], [])).toEqual({
      measurements: [],
      unseparated: [],
    });
  });

  it("the valley's five open explanations need four of its five checks", () => {
    const valley = analysisConfigFor("case_aitbouguemez");
    const catalog = valley?.fieldChecks ?? [];
    const pairs = openPairs(
      (valley?.explanations ?? []).map((e) => ({
        explanationId: e.id,
        status: "consistent" as const,
      })),
    );
    expect(pairs).toHaveLength(10);
    const cover = minimumTestCover(catalog, pairs);
    expect(cover.measurements.map((c) => c.id)).toEqual([
      "local_rain_records",
      "herd_records",
      "orchard_history",
      "seasonal_calendar",
    ]);
    expect(cover.measurements.map((c) => c.onlySeparates)).toEqual([
      [["data_artefact", "rainfall"]],
      [["data_artefact", "grazing"]],
      [["data_artefact", "land_use"]],
      [["data_artefact", "snow_terrain"]],
    ]);
    expect(coverIssues(cover, catalog, pairs)).toEqual([]);
  });

  it("matches a brute-force minimum on 300 seeded random catalogs and passes its own check", () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const ids = ["a", "b", "c", "d"];
    const all = openPairs(ids.map((id) => ({ explanationId: id, status: "consistent" as const })));
    for (let run = 0; run < 300; run += 1) {
      const catalog = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, i) =>
        m(`m${String(i)}`, ...all.filter(() => next() < 0.3)),
      );
      const open = all.filter(() => next() < 0.7);
      const cover = minimumTestCover(catalog, open);
      expect(cover.measurements.length).toBe(bruteForceSize(catalog, open));
      expect(coverIssues(cover, catalog, open)).toEqual([]);
    }
  });

  it("refuses a catalog too large for the exact search", () => {
    const many = Array.from({ length: MAX_COVER_CANDIDATES + 1 }, (_, i) =>
      m(`m${String(i)}`, ["x", "y"]),
    );
    expect(() => minimumTestCover(many, open)).toThrow(/at most/);
  });
});

describe("cover check (DF-09)", () => {
  const open: [string, string][] = [
    ["x", "y"],
    ["x", "z"],
  ];
  const catalog = [m("m1", ["x", "y"]), m("m2", ["x", "z"]), m("m3", ["x", "y"], ["x", "z"])];

  it("names a measurement whose removal leaves every open pair separated", () => {
    const choice = (id: string, separates: [string, string][]) => ({
      id,
      label: id,
      separates,
      onlySeparates: [],
    });
    const redundant = {
      measurements: [choice("m1", [["x", "y"]]), choice("m3", open)],
      unseparated: [],
    };
    expect(coverIssues(redundant, catalog, open)).toEqual([
      "Removing m1 leaves every open pair separated.",
      "m1 names no pair only it separates.",
      "m3 names no pair only it separates.",
      "A smaller cover exists: m3.",
    ]);
  });

  it("names a pair the catalog does not give and an open pair left unseparated", () => {
    const cover = {
      measurements: [
        {
          id: "m1",
          label: "m1",
          separates: [["x", "z"]] as [string, string][],
          onlySeparates: [["x", "z"]] as [string, string][],
        },
      ],
      unseparated: [],
    };
    expect(coverIssues(cover, catalog, open)).toEqual([
      "m1 does not separate x and z in the catalog.",
      "No chosen measurement separates x and z.",
    ]);
    const listed = { measurements: [], unseparated: [["x", "y"]] as [string, string][] };
    expect(coverIssues(listed, catalog, open)).toContain(
      "The catalog separates x and y, so it is not unseparated.",
    );
  });
});

function bruteForceSize(catalog: readonly CoverMeasurement[], open: [string, string][]): number {
  const key = ([a, b]: readonly [string, string]) => [a, b].sort().join("|");
  const openKeys = new Set(open.map(key));
  const sets = catalog.map((c) => new Set(c.separates.map(key).filter((k) => openKeys.has(k))));
  const target = new Set(sets.flatMap((s) => [...s]));
  let best = target.size === 0 ? 0 : Infinity;
  for (let subset = 1; subset < 2 ** sets.length; subset += 1) {
    const chosen = sets.filter((_, i) => (subset & (1 << i)) !== 0);
    const covered = new Set(chosen.flatMap((s) => [...s]));
    if (covered.size === target.size) best = Math.min(best, chosen.length);
  }
  return best;
}

function openPairsOf(catalog: readonly CoverMeasurement[]): [string, string][] {
  const keys = new Set(
    catalog.flatMap((c) => c.separates.map(([a, b]) => [a, b].sort().join("|"))),
  );
  return [...keys].sort().map((k) => k.split("|") as [string, string]);
}
