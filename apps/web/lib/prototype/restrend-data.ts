// Stored 26-season MODIS MOD13Q1 (250 m, March to June) and CHIRPS v3.0 (September to May) values from
// bundle_restrend_long_record_ait_bouguemez (recipe restrend_long_record 1.0.0, computed 2026-10-28T19:06:32Z).
// Values are copied as stored in restrend-long-record.json and restrend-long-record-tables.json; no model is called.

export type StratumId =
  "catchment" | "elevation_low" | "elevation_mid" | "elevation_high" | "aspect_level";

export interface SeasonPoint {
  year: number;
  ndvi: number;
  coverage: number;
  rainMm: number;
  dryPulse: boolean;
}

export interface StratumRecord {
  id: StratumId;
  name: string;
  elevationRange: string;
  modisPixels: number;
  unadjustedPerDecade: number;
  unadjustedInterval: [number, number];
  residualPerDecade: number;
  rSquared: number;
  status: "precondition_not_met";
  direction: "upward";
  medianNdvi: number;
  seasons: SeasonPoint[];
}

export const DRIEST_YEARS: readonly number[] = [2001, 2016, 2023, 2024];

export const PIXEL_TREND_SUMMARY = {
  bundleId: "bundle_pixel_trend_long_record_ait_bouguemez",
  recipe: "pixel_trend_long_record 1.0.0",
  resolutionM: 250,
  totalPixels: 8094,
  medianTheilSenPerDecade: "+0.00757 NDVI/dec",
  catchmentSlopePerDecade: "+0.0091 NDVI/dec",
  levelSlopePerDecade: "+0.0222 NDVI/dec",
  positiveUnadjustedPct: "91.73%",
  increasingFdrPct: "24.70%",
  decreasingFdrPct: "0.09%",
  fdrQ: "q = 0.05",
  upwardClusters: 33,
  downwardClusters: 0,
  clusterRule: ">= 4 connected 250 m pixels",
  spring2025Rank: "23rd of 26 springs",
  spring2025Delta: "+0.0162 NDVI above 26-season median",
  spring2025Ndvi: "0.2200",
  catchmentMedianNdvi: "0.2039",
  rSquared: "0.04",
  restrendStatus: "precondition_not_met",
} as const;

const RAW_CATCHMENT_NDVI: readonly [number, number, number][] = [
  [2000, 0.19614, 0.9988],
  [2001, 0.18845, 1],
  [2002, 0.18628, 0.9989],
  [2003, 0.19578, 1],
  [2004, 0.19907, 0.9728],
  [2005, 0.19419, 1],
  [2006, 0.20223, 1],
  [2007, 0.2045, 0.9965],
  [2008, 0.20146, 0.999],
  [2009, 0.19268, 1],
  [2010, 0.21179, 0.9995],
  [2011, 0.21811, 0.985],
  [2012, 0.20268, 0.992],
  [2013, 0.21636, 0.997],
  [2014, 0.21008, 1],
  [2015, 0.2071, 0.9966],
  [2016, 0.20324, 1],
  [2017, 0.22301, 0.9999],
  [2018, 0.19764, 0.9908],
  [2019, 0.22407, 1],
  [2020, 0.22188, 1],
  [2021, 0.21311, 1],
  [2022, 0.19944, 1],
  [2023, 0.20469, 1],
  [2024, 0.21021, 1],
  [2025, 0.22004, 1],
];

const RAW_CATCHMENT_RAIN: readonly [number, number][] = [
  [2000, 570.17],
  [2001, 369.19],
  [2002, 773.4],
  [2003, 503.19],
  [2004, 723.72],
  [2005, 532.36],
  [2006, 741.94],
  [2007, 634.65],
  [2008, 594.86],
  [2009, 708.39],
  [2010, 952.96],
  [2011, 794.87],
  [2012, 530.32],
  [2013, 766.63],
  [2014, 577.48],
  [2015, 638.1],
  [2016, 419.47],
  [2017, 607.7],
  [2018, 630.08],
  [2019, 663.15],
  [2020, 611.6],
  [2021, 708.84],
  [2022, 710.85],
  [2023, 420.81],
  [2024, 390.52],
  [2025, 568.7],
];

const RAW_LOW_NDVI: readonly [number, number, number][] = [
  [2000, 0.24431, 1],
  [2001, 0.23327, 1],
  [2002, 0.24752, 1],
  [2003, 0.25494, 1],
  [2004, 0.26149, 1],
  [2005, 0.24622, 1],
  [2006, 0.25928, 1],
  [2007, 0.26895, 1],
  [2008, 0.26088, 1],
  [2009, 0.26694, 1],
  [2010, 0.27365, 1],
  [2011, 0.27476, 1],
  [2012, 0.26664, 1],
  [2013, 0.29161, 1],
  [2014, 0.27425, 1],
  [2015, 0.28294, 1],
  [2016, 0.26448, 1],
  [2017, 0.28417, 1],
  [2018, 0.27148, 1],
  [2019, 0.28582, 1],
  [2020, 0.28178, 1],
  [2021, 0.28152, 1],
  [2022, 0.25833, 1],
  [2023, 0.27238, 1],
  [2024, 0.27032, 1],
  [2025, 0.28317, 1],
];

const RAW_LOW_RAIN: readonly [number, number][] = [
  [2000, 580.19],
  [2001, 372.56],
  [2002, 796.84],
  [2003, 516.23],
  [2004, 743.62],
  [2005, 531.57],
  [2006, 738.82],
  [2007, 638.7],
  [2008, 588.56],
  [2009, 721.43],
  [2010, 964.21],
  [2011, 779.94],
  [2012, 533.69],
  [2013, 772.34],
  [2014, 561.22],
  [2015, 636.27],
  [2016, 422.88],
  [2017, 617.34],
  [2018, 622.48],
  [2019, 657.37],
  [2020, 598.44],
  [2021, 706.34],
  [2022, 704.81],
  [2023, 409.03],
  [2024, 378.66],
  [2025, 552.9],
];

const RAW_MID_NDVI: readonly [number, number, number][] = [
  [2000, 0.20849, 1],
  [2001, 0.19834, 1],
  [2002, 0.19416, 1],
  [2003, 0.20303, 1],
  [2004, 0.21034, 1],
  [2005, 0.20384, 1],
  [2006, 0.21121, 1],
  [2007, 0.21668, 1],
  [2008, 0.2112, 1],
  [2009, 0.19689, 1],
  [2010, 0.22295, 1],
  [2011, 0.23015, 1],
  [2012, 0.21068, 1],
  [2013, 0.22759, 1],
  [2014, 0.2168, 1],
  [2015, 0.21363, 1],
  [2016, 0.20861, 1],
  [2017, 0.23284, 0.9996],
  [2018, 0.20548, 0.9985],
  [2019, 0.23798, 1],
  [2020, 0.23101, 1],
  [2021, 0.21703, 1],
  [2022, 0.20523, 1],
  [2023, 0.20825, 1],
  [2024, 0.21248, 1],
  [2025, 0.22789, 1],
];

const RAW_MID_RAIN: readonly [number, number][] = [
  [2000, 570.45],
  [2001, 365.88],
  [2002, 768.32],
  [2003, 499.27],
  [2004, 718.95],
  [2005, 529.24],
  [2006, 739.96],
  [2007, 637.1],
  [2008, 594.99],
  [2009, 712.92],
  [2010, 950.73],
  [2011, 789.99],
  [2012, 529.9],
  [2013, 764.5],
  [2014, 577.35],
  [2015, 634],
  [2016, 422.11],
  [2017, 610.1],
  [2018, 631.87],
  [2019, 668.65],
  [2020, 616.03],
  [2021, 709.76],
  [2022, 712.46],
  [2023, 423.28],
  [2024, 390.41],
  [2025, 567.93],
];

const RAW_HIGH_NDVI: readonly [number, number, number][] = [
  [2000, 0.13541, 0.9964],
  [2001, 0.13375, 1],
  [2002, 0.11693, 0.9966],
  [2003, 0.12935, 1],
  [2004, 0.11882, 0.9183],
  [2005, 0.1325, 1],
  [2006, 0.13622, 1],
  [2007, 0.12706, 0.9894],
  [2008, 0.13208, 0.9969],
  [2009, 0.11421, 1],
  [2010, 0.13865, 0.9985],
  [2011, 0.14619, 0.9551],
  [2012, 0.12895, 0.9759],
  [2013, 0.12909, 0.991],
  [2014, 0.1392, 1],
  [2015, 0.12388, 0.9898],
  [2016, 0.13665, 1],
  [2017, 0.15201, 1],
  [2018, 0.11381, 0.974],
  [2019, 0.14842, 1],
  [2020, 0.15284, 1],
  [2021, 0.14078, 1],
  [2022, 0.13475, 1],
  [2023, 0.13343, 1],
  [2024, 0.14783, 1],
  [2025, 0.14908, 1],
];

const RAW_HIGH_RAIN: readonly [number, number][] = [
  [2000, 559.89],
  [2001, 369.14],
  [2002, 755.03],
  [2003, 494.06],
  [2004, 708.6],
  [2005, 536.27],
  [2006, 747.02],
  [2007, 628.16],
  [2008, 601.03],
  [2009, 690.83],
  [2010, 943.94],
  [2011, 814.69],
  [2012, 527.37],
  [2013, 763.05],
  [2014, 593.88],
  [2015, 644.02],
  [2016, 413.42],
  [2017, 595.65],
  [2018, 635.9],
  [2019, 663.43],
  [2020, 620.31],
  [2021, 710.41],
  [2022, 715.28],
  [2023, 430.14],
  [2024, 402.49],
  [2025, 585.27],
];

function medianOf(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0);
}

function pairSeasons(
  ndviRows: readonly [number, number, number][],
  rainRows: readonly [number, number][],
): SeasonPoint[] {
  const rainMap = new Map(rainRows.map(([y, mm]) => [y, mm]));
  return ndviRows.map(([year, ndvi, coverage]) => ({
    year,
    ndvi,
    coverage,
    rainMm: rainMap.get(year) ?? 0,
    dryPulse: DRIEST_YEARS.includes(year),
  }));
}

const catchmentSeasons = pairSeasons(RAW_CATCHMENT_NDVI, RAW_CATCHMENT_RAIN);
const lowSeasons = pairSeasons(RAW_LOW_NDVI, RAW_LOW_RAIN);
const midSeasons = pairSeasons(RAW_MID_NDVI, RAW_MID_RAIN);
const highSeasons = pairSeasons(RAW_HIGH_NDVI, RAW_HIGH_RAIN);

export const RESTREND_STRATA: readonly StratumRecord[] = [
  {
    id: "catchment",
    name: "Whole Catchment",
    elevationRange: "1,800 to 3,700 m",
    modisPixels: 8094,
    unadjustedPerDecade: 0.0091,
    unadjustedInterval: [0.0046, 0.0136],
    residualPerDecade: 0.0094,
    rSquared: 0.04,
    status: "precondition_not_met",
    direction: "upward",
    medianNdvi: medianOf(catchmentSeasons.map((s) => s.ndvi)),
    seasons: catchmentSeasons,
  },
  {
    id: "elevation_low",
    name: "Lower Band",
    elevationRange: "Below 2,317 m",
    modisPixels: 2892,
    unadjustedPerDecade: 0.0134,
    unadjustedInterval: [0.0078, 0.019],
    residualPerDecade: 0.0143,
    rSquared: 0.07,
    status: "precondition_not_met",
    direction: "upward",
    medianNdvi: medianOf(lowSeasons.map((s) => s.ndvi)),
    seasons: lowSeasons,
  },
  {
    id: "elevation_mid",
    name: "Middle Band",
    elevationRange: "2,317 to 2,815 m",
    modisPixels: 3264,
    unadjustedPerDecade: 0.0072,
    unadjustedInterval: [0.0015, 0.0129],
    residualPerDecade: 0.0077,
    rSquared: 0.08,
    status: "precondition_not_met",
    direction: "upward",
    medianNdvi: medianOf(midSeasons.map((s) => s.ndvi)),
    seasons: midSeasons,
  },
  {
    id: "elevation_high",
    name: "Upper Band",
    elevationRange: "2,815 m and above",
    modisPixels: 3197,
    unadjustedPerDecade: 0.007,
    unadjustedInterval: [0.0016, 0.0124],
    residualPerDecade: 0.0068,
    rSquared: 0.01,
    status: "precondition_not_met",
    direction: "upward",
    medianNdvi: medianOf(highSeasons.map((s) => s.ndvi)),
    seasons: highSeasons,
  },
  {
    id: "aspect_level",
    name: "Level Ground",
    elevationRange: "Slope below 5 deg",
    modisPixels: 2717,
    unadjustedPerDecade: 0.0222,
    unadjustedInterval: [0.0155, 0.0289],
    residualPerDecade: 0.0228,
    rSquared: 0.02,
    status: "precondition_not_met",
    direction: "upward",
    medianNdvi: medianOf(lowSeasons.map((s) => s.ndvi)),
    seasons: lowSeasons,
  },
];
