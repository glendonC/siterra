import type { Provenance, Source } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import {
  type ClimateYearRow,
  computeStatsFromAnnual,
  unavailableClimate,
} from "./climate-series.ts";
import { synthesizePlaceQuestionAndEvidence } from "./literature.ts";

// The default question for a live place asks only what the live record can answer (rainfall since 2000, land
// cover today, terrain and water) and presumes no result; a question the visitor chose always wins.
const NOW = "2026-11-02T12:00:00.000Z";

const provenance: Provenance = {
  sourceLocators: [],
  dataBundleIds: [],
  methodId: null,
  methodVersion: null,
  inputVersions: [],
  generatedByTaskId: null,
  generatedAt: NOW,
  verificationStatus: "unverified",
  limitations: ["Test record."],
};

function era5Source(): Source {
  return {
    recordType: "Source",
    id: "src_era5_new_york_317deb",
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    caseId: "case_loc_new_york_317deb",
    title: "Open-Meteo Historical Weather API (ERA5 reanalysis), 2000 to 2024, for New York",
    url: "https://open-meteo.com/en/docs/historical-weather-api",
    publisher: "Open-Meteo",
    authors: [],
    publicationDate: null,
    accessedAt: NOW,
    sourceKind: "official_dataset",
    accessStatus: "retrieved",
    license: "CC BY 4.0",
    redistributionStatus: "permitted",
    contentHash: null,
    notes: ["Daily precipitation."],
  };
}

function questionFor(
  climate: ReturnType<typeof computeStatsFromAnnual>,
  userQuestion?: string,
  theme = false,
) {
  const sources: Source[] = [era5Source()];
  if (theme)
    sources.push({
      ...era5Source(),
      id: "src_oa_new_york_317deb_1",
      sourceKind: "peer_reviewed",
      title: "Nutrient runoff and water quality in urban watersheds",
      notes: ["Nitrogen runoff degrades water quality in urban streams across the region."],
    });
  return synthesizePlaceQuestionAndEvidence({
    caseId: "case_loc_new_york_317deb",
    slug: "new_york",
    hash6: "317deb",
    placeName: "New York",
    regionName: "United States",
    userQuestion,
    now: NOW,
    geoId: "geo_loc_new_york_317deb",
    periodIds: [],
    measurementIds: {
      catchmentTrendId: "meas_catchment_trend_new_york_317deb",
      precipTrendId: "meas_precip_trend_new_york_317deb",
      rainR2Id: "meas_rain_r2_new_york_317deb",
    },
    recordProvenance: provenance,
    terrain: { minElevationM: 0, maxElevationM: 52 },
    climate,
    sources,
  });
}

function measured() {
  const years: ClimateYearRow[] = [];
  for (let yr = 2000; yr <= 2024; yr++)
    years.push({ year: yr, precipMm: 1100 + (yr % 3) * 50, et0Mm: null });
  return computeStatsFromAnnual(years);
}

const PRESUMES = /vegetation|greening|browning|greenness|driving|decline|stability|sustain/i;

describe("live place questions", () => {
  it("asks by default what the live record can answer: rainfall, land cover, terrain and water", () => {
    for (const theme of [false, true]) {
      const { question } = questionFor(measured(), undefined, theme);
      expect(question).not.toMatch(PRESUMES);
      expect(question).toMatch(/rainfall/i);
      expect(question).toMatch(/land cover/i);
      expect(question).toMatch(/water/i);
      expect(question.length).toBeLessThanOrEqual(95);
    }
  });

  it("leaves rainfall out of the default question when the archive did not answer", () => {
    const { question } = questionFor(unavailableClimate("HTTP 503"));
    expect(question).not.toMatch(/rainfall/i);
    expect(question).not.toMatch(PRESUMES);
    expect(question).toMatch(/land cover/i);
  });

  it("keeps the vegetation question open, as unresolved, without a result in it", () => {
    const { unresolvedQuestions } = questionFor(measured());
    expect(unresolvedQuestions.join(" ")).toMatch(
      /Has vegetation across New York changed since 2000\?/,
    );
    expect(unresolvedQuestions.join(" ")).not.toMatch(/interact|greening|browning/i);
  });

  it("uses the visitor's own question as given", () => {
    const own = "Is vegetation greening across New York?";
    const { question, unresolvedQuestions } = questionFor(measured(), own);
    expect(question).toBe(own);
    expect(unresolvedQuestions[0]).toBe(own);
  });
});
