import { describe, expect, it } from "vitest";
import { seasonTrendFrom } from "../instruments/valley/derive";
import { bundleFiles, seed, seedListing } from "../instruments/seed-listing";
import { findingsFrom } from "./findings";
import {
  catchmentAreaKm2,
  chartScale,
  olsIntercept,
  reference,
  referencesOf,
  stratumSeasons,
  yearTicks,
} from "./record";
import { loadRecord } from "./record-data";

describe("the record's chart scale", () => {
  it("rounds out to half a step and puts at least two gridlines inside (D4's pixel chart)", () => {
    expect(chartScale([0.287, 0.535])).toEqual({ lo: 0.25, hi: 0.55, ticks: [0.3, 0.4, 0.5] });
  });

  it("takes a finer step for a narrow range", () => {
    expect(chartScale([0.19, 0.23])).toEqual({ lo: 0.19, hi: 0.23, ticks: [0.2, 0.22] });
  });

  it("labels the first year, each decade and the last", () => {
    expect(yearTicks(2000, 2025)).toEqual([2000, 2010, 2020, 2025]);
  });

  it("puts the least squares line through the means", () => {
    const s = [
      { year: 2000, ndvi: 1 },
      { year: 2002, ndvi: 3 },
    ];
    expect(olsIntercept(s, 1)).toBe(2 - 2001);
  });
});

describe("the record from the seed case", () => {
  const get = (url: string) => bundleFiles(url);
  const { findings } = findingsFrom(seed, seedListing);
  const value = (id: string) => findings.find((f) => f.id === id)?.value;

  it("charts the band's 26 means with the slope its Measurement shows", async () => {
    const r = await loadRecord("band", seedListing, seed, null, get);
    expect(r.chart?.seasons).toHaveLength(26);
    expect(r.chart?.slopePerDecade).toBe(value("band"));
    expect(r.chart?.fit).toBe("ols");
    expect(r.context?.text).toBe(
      "Irrigated valley floor, about 1,800 to 2,200 m, with more than thirty villages.",
    );
    expect(r.context?.references).toEqual([
      "El Aayadi et al. 2026, Sustainable Earth Reviews 9, article 7, p. 5",
      "Auclair et al. 2011, Ecology and Society 16(4): 24, p. 2",
    ]);
  });

  it("charts the catchment's 26 means with the slope its Measurement shows", async () => {
    const r = await loadRecord("catchment", seedListing, seed, null, get);
    expect(r.chart?.seasons).toHaveLength(26);
    expect(r.chart?.slopePerDecade).toBe(value("catchment"));
    expect(r.context).toBeNull();
  });

  it("reads the rain scatter and gives the fdr share no chart", async () => {
    const rain = await loadRecord("rain", seedListing, seed, null, get);
    expect(rain.scatter?.seasons).toHaveLength(26);
    expect(rain.scatter?.fit.r_squared).toBe(value("rain"));
    const fdr = await loadRecord("fdr", seedListing, seed, null, get);
    expect(fdr).toEqual({ chart: null, scatter: null, context: null });
  });

  it("shows the pixel's first context in its display text, never the Evidence statement", async () => {
    const r = await loadRecord("pixel", seedListing, seed, null, get);
    const spec = seed.records.instrumentSpecRecords?.find(
      (s) => s.parameters.kind === "pixel_anatomy",
    );
    const display = spec?.parameters.kind === "pixel_anatomy" ? spec.parameters.contextDisplay : [];
    expect(r.context?.text).toBe(display?.[0]?.text);
    expect(r.context?.references).toEqual([
      "El Aayadi et al. 2026, Sustainable Earth Reviews 9, article 7, pp. 7, 8",
    ]);
  });

  it("reads the season means from the tables and the slope from the summary as the instruments do", () => {
    const seasons = stratumSeasons({ seasons: [] }, "catchment");
    expect(seasons).toEqual([]);
    expect(() => seasonTrendFrom({ results: [] })).toThrow();
  });

  it("names no source it cannot find", () => {
    expect(referencesOf(seed, ["ev_no_such_record"])).toEqual([]);
  });

  it("gives the catchment area as the record stores it", () => {
    expect(catchmentAreaKm2(seed)).toBe("417.04");
  });
});

describe("a short reference (the citation rule)", () => {
  it("reads an author list that records 'et al.' as an entry as the first author with et al.", () => {
    const src = seed.records.sourceRecords.find((x) => x.id === "src_SCI-04");
    if (!src) throw new Error("src_SCI-04");
    expect(reference(src, ["3"]).startsWith("Aakairi et al. 2026, ")).toBe(true);
    expect(
      reference({ ...src, authors: ["Aakairi, M.", "Bourbouze, Alain"] }, []).startsWith(
        "Aakairi and Bourbouze 2026",
      ),
    ).toBe(true);
  });
});
