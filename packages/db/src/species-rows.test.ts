import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Measurement } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { readCaseSeed } from "./case-seed.ts";

// The counts of the stored GBIF occurrence bundle as Measurements: read from the bundle's summary by
// pointer, worded as records, never as abundance. The expected numbers are read from the summary
// file in this test, not typed.

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const base = {
  repoDir,
  mode: "concept" as const,
  ownerScopeId: "seed",
  importedAt: "2026-10-30T13:00:00Z",
};

interface Summary {
  counts: { kept: number };
  by_group: Record<string, number>;
  by_year: Record<string, number>;
  named_taxa: { name: string; kept: number }[];
}

function summaryOf(place: string): Summary {
  return JSON.parse(
    readFileSync(
      `${repoDir}data/bundles/bundle_species_occurrences_${place}/species-occurrences.json`,
      "utf8",
    ),
  ) as Summary;
}

const places = [
  {
    place: "ait_bouguemez",
    seedDir: undefined,
    bundle: "bundle_species_occurrences_ait_bouguemez",
  },
  {
    place: "calaveras_creek",
    seedDir: "data/case/calaveras-creek",
    bundle: "bundle_species_occurrences_calaveras_creek",
  },
];

describe.each(places)("species record counts of $place", ({ place, seedDir, bundle }) => {
  const result = readCaseSeed({ ...base, ...(seedDir ? { seedDir } : {}) });
  const summary = summaryOf(place);
  const mine = (result.seed?.bundles ?? [])
    .flatMap((b) => b.measurements)
    .filter((m) => m.dataBundleId === bundle);
  const by = (metric: string): Measurement[] => mine.filter((m) => m.metric === metric);

  it("load without an issue", () => {
    expect(result.issues).toEqual([]);
  });

  it("give the number of kept records and of each group, as stored", () => {
    const kept = by("species_records_kept");
    expect(kept).toHaveLength(1);
    expect(kept[0]?.value).toBe(summary.counts.kept);
    expect(kept[0]?.unit).toBe("records");
    const groups = Object.fromEntries(by("species_records_in_group").map((m) => [m.id, m.value]));
    const expected = Object.entries(summary.by_group);
    expect(Object.keys(groups)).toHaveLength(expected.length);
    for (const [group, count] of expected) {
      expect(groups[`meas_species_records_${group}_catchment`], group).toBe(count);
    }
  });

  it("word them as records of a stored bundle, never as abundance, presence or change", () => {
    expect(mine.length).toBeGreaterThan(1);
    for (const m of mine.filter((x) => x.metric.startsWith("species_records"))) {
      expect(m.aggregation, m.id).toMatch(/records?/i);
      expect(m.aggregation, m.id).toMatch(/not (an )?abundance/i);
      expect(m.aggregation, m.id).not.toMatch(/present|absent|declin|increas|decreas|common|rare/i);
      expect(m.uncertainty.kind).toBe("not_quantified");
      expect(m.source?.claimKind).toBe("observation");
    }
  });

  it("span the years the records give, and name no period outside them", () => {
    const years = Object.keys(summary.by_year).map(Number);
    const first = String(Math.min(...years));
    const last = String(Math.max(...years));
    for (const m of mine.filter((x) => x.metric.startsWith("species_records"))) {
      expect(m.source?.period.start, m.id).toBe(first);
      expect(m.source?.period.end, m.id).toBe(last);
    }
  });

  it("count each plant a source names, zero included, with the stored answer", () => {
    const named = by("species_records_of_named_taxon");
    expect(named).toHaveLength(summary.named_taxa.length);
    for (const [index, taxon] of summary.named_taxa.entries()) {
      const id = `meas_species_records_named_${taxon.name.toLowerCase().replaceAll(" ", "_")}`;
      expect(named.find((m) => m.id === id)?.value, taxon.name).toBe(taxon.kept);
      // Every stored answer may be zero, so the value cannot tell the taxa apart: the pointer must.
      expect(named.find((m) => m.id === id)?.source?.jsonPointer, taxon.name).toBe(
        `/named_taxa/${String(index)}/kept`,
      );
    }
  });
});
