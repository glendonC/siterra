import type { MemoryCaseStore } from "../tools/store.ts";
import { CASE_ID, bundle, measurement } from "./case-fixture.ts";

// SYNTHETIC FIXTURE for explanation branches. Six invented months of vegetation and rainfall
// departures under TEST_ANALYSIS_CONFIG, one season summary and synthetic replies for the two
// configured explanations. Nothing here is a finding about any place.

export const BRANCH_PERIODS = [
  "period_2021-11",
  "period_2021-12",
  "period_2022-01",
  "period_2022-02",
  "period_2022-03",
  "period_2022-04",
];
export const BRANCH_VALUES = {
  vegetation: [-0.0213, -0.0331, -0.0117, -0.0242, -0.0408, -0.0519],
  vegetationLeaveOneYearOut: [-0.0198, -0.0302, -0.0109, -0.0231, -0.0377, -0.0488],
  rainfall: [-5.17, -3.29, 2.41, -4.63, -6.07, -1.13],
  seasonDepartureMm: -61.4,
};
export const BRANCH_SEASON = "season_2021-11_2022-04";

/** Adds the branch record to a test store; `omit` leaves a configured input out. */
export function addBranchRecord(
  store: MemoryCaseStore,
  omit: readonly ("rainfall" | "season")[] = [],
): MemoryCaseStore {
  store.bundles.push(
    bundle({
      id: "bundle_test_vegdep",
      revision: 1,
      methodId: "test_veg_departure",
      periodIds: BRANCH_PERIODS,
    }),
  );
  if (!omit.includes("rainfall")) {
    store.bundles.push(
      bundle({
        id: "bundle_test_rainmon",
        revision: 1,
        methodId: "test_rain_monthly",
        periodIds: BRANCH_PERIODS,
      }),
    );
  }
  BRANCH_PERIODS.forEach((p, i) => {
    const at = { dataBundleId: "bundle_test_vegdep" };
    store.measurements.push(
      measurement(p, BRANCH_VALUES.vegetation[i] ?? null, {
        ...at,
        id: `meas_vd_${String(i)}`,
        metric: "ndvi_departure_area_median",
      }),
      measurement(p, BRANCH_VALUES.vegetationLeaveOneYearOut[i] ?? null, {
        ...at,
        id: `meas_vl_${String(i)}`,
        metric: "ndvi_departure_area_median_leave_one_year_out",
      }),
    );
    if (!omit.includes("rainfall")) {
      store.measurements.push(
        measurement(p, BRANCH_VALUES.rainfall[i] ?? null, {
          dataBundleId: "bundle_test_rainmon",
          id: `meas_rd_${String(i)}`,
          metric: "precipitation_departure_from_1991_2020_mean",
        }),
      );
    }
    store.quality.push({
      caseId: CASE_ID,
      bundleId: "bundle_test_vegdep",
      periodId: p,
      qualityFlags: p === "period_2022-02" ? ["snow_suspected"] : [],
    });
  });
  if (!omit.includes("season")) {
    store.bundles.push(
      bundle({
        id: "bundle_test_season",
        revision: 1,
        methodId: "season_summary",
        methodVersion: "1.0.0",
        periodIds: [],
      }),
    );
    store.recipeResults.push({
      caseId: CASE_ID,
      bundleId: "bundle_test_season",
      recipeId: "season_summary",
      version: "1.0.0",
      result: {
        recipeId: "season_summary",
        version: "1.0.0",
        seasons: [
          {
            season_id: BRANCH_SEASON,
            season_departure_mm: BRANCH_VALUES.seasonDepartureMm,
            season_category: "below_normal",
          },
        ],
      },
    });
  }
  return store;
}

/** The unused test fields of a prediction, set as the grammar requires. */
export const UNUSED_TEST_FIELDS = {
  pairId: null,
  side: null,
  periodIds: [],
  windowMonths: null,
  seasonId: null,
  flag: null,
  fieldCheckId: null,
  expected: null,
};

export const RAINFALL_REPLY = {
  predictions: [
    {
      necessary: true,
      test: {
        ...UNUSED_TEST_FIELDS,
        kind: "season_category",
        seasonId: BRANCH_SEASON,
        expected: "below_normal",
      },
      wording: `The wet season ${BRANCH_SEASON} is below normal.`,
    },
    {
      necessary: false,
      test: {
        ...UNUSED_TEST_FIELDS,
        kind: "co_movement",
        pairId: "vegetation_rainfall",
        windowMonths: 0,
        expected: "same_sign_majority",
      },
      wording: "Most aligned months of vegetation and rainfall departures share a sign.",
    },
  ],
};

export const GRAZING_REPLY = {
  predictions: [
    {
      necessary: true,
      test: {
        ...UNUSED_TEST_FIELDS,
        kind: "season_category",
        seasonId: BRANCH_SEASON,
        expected: "near_normal",
      },
      wording: `The wet season ${BRANCH_SEASON} is near normal.`,
    },
    {
      necessary: false,
      test: { ...UNUSED_TEST_FIELDS, kind: "field_check", fieldCheckId: "grazing_exclosure" },
      wording: "Grazed plots are lower in greenness than ungrazed plots.",
    },
  ],
};
