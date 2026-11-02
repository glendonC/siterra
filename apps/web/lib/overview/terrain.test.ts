import { describe, expect, it } from "vitest";
import { lonLatToUtm } from "../instruments/valley/utm";
import { encodeRuns } from "../live-place/water-mask";
import type { CaseSnapshot } from "@siterra/contracts";
import {
  fallbackRecordData,
  overviewDataFromTerrain,
  utmToGridMapper,
  type TerrainFile,
} from "./terrain";

const BBOX: [number, number, number, number] = [-74.124532, 40.622899, -73.887508, 40.802561];

/** A 256 x 256 version 2 grid that rises 500 m from the west edge to the east edge. */
function eastRamp(): TerrainFile {
  const size = 256;
  const elevations: number[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      elevations.push(Number((1000 + (500 * c) / (size - 1)).toFixed(1)));
  const [w, s, e, n] = BBOX;
  return {
    version: 2,
    gridSize: size,
    width: size,
    height: size,
    bbox: BBOX,
    minElevationM: 1000,
    maxElevationM: 1500,
    elevations,
    catchmentRing: [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
    streamPaths: [],
  };
}

describe("terrain grid to overview relief", () => {
  it("maps a UTM point back to its place on the lon/lat grid", () => {
    const zone = 18;
    const toGrid = utmToGridMapper(BBOX, zone, 256, 256);
    for (const [fc, fr] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [0.13, 0.87],
    ] as const) {
      const lon = BBOX[0] + fc * (BBOX[2] - BBOX[0]);
      const lat = BBOX[3] - fr * (BBOX[3] - BBOX[1]);
      const [E, N] = lonLatToUtm(lon, lat, zone);
      const [col, row] = toGrid(E, N);
      expect(col).toBeCloseTo(fc * 255, 3);
      expect(row).toBeCloseTo(fr * 255, 3);
    }
  });

  it("puts each relief cell's height at that cell's own place, not stretched index to index", async () => {
    const overview = await overviewDataFromTerrain(eastRamp());
    const g = overview.meta.relief;
    const midLat = (BBOX[1] + BBOX[3]) / 2;
    const heightAt = (lon: number) => {
      const [E, N] = lonLatToUtm(lon, midLat, overview.zone);
      const c = Math.round((E - g.E0) / g.res - 0.5);
      const r = Math.round((g.N0 - N) / g.res - 0.5);
      return overview.relief[r * g.width + c] ?? NaN;
    };
    const widthM =
      lonLatToUtm(BBOX[2], midLat, overview.zone)[0] -
      lonLatToUtm(BBOX[0], midLat, overview.zone)[0];
    const perCell = (500 * g.res) / widthM; // the ramp's rise over one relief cell, about 2 m
    for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const lon = BBOX[0] + f * (BBOX[2] - BBOX[0]);
      expect(Math.abs(heightAt(lon) - (1000 + 500 * f))).toBeLessThanOrEqual(1.5 + perCell);
    }
  });
});

describe("water in the overview", () => {
  it("draws water flat at its level and leaves it out of the land's range", async () => {
    const t = eastRamp();
    const size = 256;
    const mask = new Uint8Array(size * size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < 60; c++) {
        mask[r * size + c] = 1;
        // a lake whose DEM holds its bed, from 900 m in the west up to 980 m at the shore; the land starts at 1000 m
        t.elevations[r * size + c] = 900 + (80 * c) / 59;
      }
    t.waterMask = { runs: encodeRuns(mask), source: "worldcover_terrarium" };
    const overview = await overviewDataFromTerrain(t);
    // the land's own range: the lake bed is not land
    expect(overview.range.min).toBeGreaterThanOrEqual(975);
    const water = overview.water;
    if (!water) throw new Error("no water grid");
    const g = overview.meta.relief;
    const midLat = (BBOX[1] + BBOX[3]) / 2;
    const cellAt = (f: number) => {
      const [E, N] = lonLatToUtm(BBOX[0] + f * (BBOX[2] - BBOX[0]), midLat, overview.zone);
      return Math.round((g.N0 - N) / g.res - 0.5) * g.width + Math.round((E - g.E0) / g.res - 0.5);
    };
    // two places on the lake: both water, both drawn at one level near the shore, not at the bed under them
    const a = cellAt(0.03);
    const b = cellAt(0.15);
    expect(water[a]).toBe(255);
    expect(water[b]).toBe(255);
    expect(overview.relief[a]).toBe(overview.relief[b]);
    expect(overview.relief[a]).toBeGreaterThan(960);
  });
});

describe("nothing invented on a live place's land", () => {
  it("paints no slope or rain cells, and no land cover where WorldCover was not read", async () => {
    const overview = await overviewDataFromTerrain(eastRamp());
    expect(overview.footprints).toEqual({ slope: null, rain: null });
    const px = (overview.landcover as unknown as { data?: Uint8ClampedArray }).data;
    if (!px) throw new Error("no land cover pixels");
    let inside = 0;
    let covered = 0;
    for (let p = 0; p < px.length; p += 4) {
      if ((px[p + 2] ?? 0) > 127) inside++;
      if ((px[p] ?? 0) > 0 || (px[p + 1] ?? 0) > 0) covered++;
    }
    expect(inside).toBeGreaterThan(1000);
    expect(covered).toBe(0);
  });

  it("weights mapped streams by their kind when known, and claims no order when not", async () => {
    const t = eastRamp();
    const line = (lat: number): [number, number][] => [
      [-74.1, lat],
      [-74.0, lat],
      [-73.9, lat],
    ];
    t.streamPaths = [line(40.65), line(40.7), line(40.75)];
    t.streamSource = "openstreetmap";
    const plain = await overviewDataFromTerrain(t);
    expect(plain.rivers.reaches.map((r) => r.order)).toEqual([3, 3, 3]);
    t.streamKinds = ["stream", "river", "canal"];
    const kinds = await overviewDataFromTerrain(t);
    expect(kinds.rivers.reaches.map((r) => r.order)).toEqual([3, 4, 2]);
  });
});

/** A live case's record holding only the given measurements. */
function liveSnapshot(measurementRecords: unknown[]): CaseSnapshot {
  return {
    case: { id: "case_loc_test_abc123" },
    records: {
      measurementRecords,
      evidenceRecords: [],
      sourceRecords: [],
      instrumentSpecRecords: [],
      dataBundleRecords: [],
    },
  } as unknown as CaseSnapshot;
}

const season = (year: number, ndvi: number) => ({
  id: `m_ndvi_${String(year)}`,
  metric: "ndvi_growing_season_mean",
  periodId: `period_${String(year)}-06`,
  value: ndvi,
});
const rain = (year: number, mm: number) => ({
  id: `m_rain_${String(year)}`,
  metric: "precipitation_annual_mm",
  periodId: `period_${String(year)}-06`,
  value: mm,
});

describe("a finding's chart from the record", () => {
  it("draws no chart and no rainfall scatter where the record holds no series", () => {
    const snap = liveSnapshot([]);
    for (const id of ["catchment", "band", "pixel"] as const) {
      expect(fallbackRecordData(id, snap).chart).toBeNull();
    }
    expect(fallbackRecordData("rain", snap).scatter).toBeNull();
  });

  it("keeps a recorded series as it is, and draws no band chart from the whole area's", () => {
    const snap = liveSnapshot([
      season(2001, 0.21),
      season(2002, 0.24),
      season(2003, 0.22),
      {
        id: "m_trend",
        metric: "ndvi_trend_per_decade",
        periodId: "period_all",
        geoSelectionId: "geo_x",
        value: 0.01,
        uncertainty: { lower: 0.002, upper: 0.018 },
      },
    ]);
    const chart = fallbackRecordData("catchment", snap).chart;
    expect(chart?.seasons).toEqual([
      { year: 2001, ndvi: 0.21 },
      { year: 2002, ndvi: 0.24 },
      { year: 2003, ndvi: 0.22 },
    ]);
    expect([chart?.lower, chart?.upper]).toEqual([0.002, 0.018]);
    expect(fallbackRecordData("band", snap).chart).toBeNull();
  });

  it("fits the rainfall scatter to recorded pairs with its interval from the residuals", () => {
    const years = [2001, 2002, 2003, 2004, 2005, 2006];
    const mm = [300, 420, 380, 510, 260, 450];
    const ndvi = [0.2, 0.25, 0.22, 0.27, 0.19, 0.26];
    const snap = liveSnapshot([
      ...years.map((y, i) => season(y, ndvi[i] ?? 0)),
      ...years.map((y, i) => rain(y, mm[i] ?? 0)),
    ]);
    const scatter = fallbackRecordData("rain", snap).scatter;
    if (!scatter) throw new Error("no scatter");
    expect(scatter.seasons.map((x) => x.rain_mm)).toEqual(mm);
    const { slope_per_100_mm: b, lower, upper } = scatter.fit;
    expect(lower).toBeLessThan(b);
    expect(upper).toBeGreaterThan(b);
    expect(upper - b).toBeCloseTo(b - lower, 10);
    // not the old invented band of half to one and a half times the slope
    expect(lower).not.toBeCloseTo(b * 0.5, 6);
  });
});
