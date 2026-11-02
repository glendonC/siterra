import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cachedLive, liveCacheKey, readLiveCache } from "./live-cache.ts";
import { type Bbox, type StacItem, modisWindowForBbox, parseNpy } from "./planetary.ts";
import {
  type ModisComposite,
  type ModisStack,
  type SeasonWindow,
  chooseGrowingWindow,
  computeVegetationSeries,
  fetchVegetationSeries,
  filterComposite,
  groupTerraItems,
  periodStarts,
  seasonPeriods,
} from "./vegetation-series.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
// Recorded 2 Nov 2026 (see planetary.test.ts): MOD13Q1.A2026273 over Central Park, NDVI, reliability, mask.
const centralParkNpy = new Uint8Array(fixture("modis-mod13q1-a2026273-central-park.npy"));
const CENTRAL_PARK_BBOX: Bbox = [-73.975, 40.775, -73.955, 40.79];
// Recorded 2 Nov 2026: STAC search for New York, May to August 2024 (Terra and Aqua, one duplicate production).
const stacNewYork2024 = JSON.parse(
  fixture("modis-stac-new-york-2024-may-aug.json").toString("utf8"),
) as {
  features: StacItem[];
};

describe("MODIS 16-day periods", () => {
  it("start on day of year 1, 17, ..., 353, leap years included", () => {
    const p2026 = periodStarts(2026);
    expect(p2026).toHaveLength(23);
    expect(p2026[0]).toBe("2026-01-01");
    expect(p2026).toContain("2026-09-30");
    expect(periodStarts(2024)).toContain("2024-09-29");
  });

  it("put a season that crosses the year end in the year it starts", () => {
    expect(seasonPeriods(2000, [12, 1, 2, 3])).toEqual([
      "2000-12-02",
      "2000-12-18",
      "2001-01-01",
      "2001-01-17",
      "2001-02-02",
      "2001-02-18",
      "2001-03-06",
      "2001-03-22",
    ]);
  });
});

describe("groupTerraItems", () => {
  it("keeps Terra by ID prefix even without a platform property, newest production per date", () => {
    const groups = groupTerraItems(stacNewYork2024.features);
    expect(groups.map((g) => g.start)).toEqual([
      "2024-04-22",
      "2024-05-08",
      "2024-05-24",
      "2024-06-09",
      "2024-06-25",
      "2024-07-11",
      "2024-07-27",
      "2024-08-28",
    ]);
    expect(groups[1]?.itemIds).toEqual(["MOD13Q1.A2024129.h12v04.061.2024153222356"]);
    expect(groups.flatMap((g) => g.itemIds).some((id) => id.startsWith("MYD"))).toBe(false);
  });

  it("drops an item whose platform says Aqua", () => {
    const item: StacItem = {
      id: "MOD13Q1.A2024113.h12v04.061.2024133221609",
      properties: {
        start_datetime: "2024-04-22T00:00:00Z",
        end_datetime: "2024-05-07T23:59:59Z",
        platform: "aqua",
      },
    };
    expect(groupTerraItems([item])).toEqual([]);
  });
});

describe("filterComposite", () => {
  it("keeps NDVI only where reliability is 0 or 1 and the mask has data", () => {
    const arr = parseNpy(centralParkNpy);
    if (!arr) throw new Error("fixture did not parse");
    const window = modisWindowForBbox(CENTRAL_PARK_BBOX);
    const values = filterComposite(arr, window);
    const row4 = Array.from(values.subarray(4 * 14, 5 * 14)).map((v) =>
      Number.isNaN(v) ? null : Number(v.toFixed(4)),
    );
    expect(row4).toEqual([
      null,
      null,
      null,
      null,
      0.3917,
      0.7415,
      0.8272,
      0.8272,
      0.5888,
      0.305,
      0.1806,
      0.2417,
      null,
      null,
    ]);
    expect(values.every((v) => Number.isNaN(v) || (v >= -0.2 && v <= 1))).toBe(true);
  });

  it("refuses a crop of the wrong size instead of misplacing pixels", () => {
    const arr = parseNpy(centralParkNpy);
    if (!arr) throw new Error("fixture did not parse");
    expect(() => filterComposite(arr, { bounds: [0, 0, 1, 1], width: 13, height: 8 })).toThrow(
      /expected 3 x 8 x 13/,
    );
  });
});

// Synthetic test inputs below: hand-made grids that exercise the rules, not data about any place.
function compositeAt(start: string, values: number[]): ModisComposite {
  return { start, itemIds: [`test-${start}`], values: Float32Array.from(values) };
}

describe("chooseGrowingWindow", () => {
  it("picks the four months with the highest mean on the reference years' cycle, wrapping the year end", () => {
    const composites: ModisComposite[] = [];
    for (const y of [2003, 2012, 2021]) {
      for (const p of periodStarts(y)) {
        const m = Number.parseInt(p.slice(5, 7), 10);
        // Greenest from November to February.
        const v = m >= 11 || m <= 2 ? 0.6 : 0.2;
        composites.push(compositeAt(p, [v, Number.NaN]));
      }
    }
    const w = chooseGrowingWindow({ composites, inPlace: Uint8Array.from([1, 1]) });
    expect(w?.months).toEqual([11, 12, 1, 2]);
    expect(w?.label).toBe("November to February");
    expect(w?.referenceYears).toEqual([2003, 2012, 2021]);
  });

  it("ignores other years and cannot choose a window with an unread month", () => {
    const composites = periodStarts(2010).map((p) => compositeAt(p, [0.5]));
    expect(chooseGrowingWindow({ composites, inPlace: Uint8Array.from([1]) })).toBeNull();
  });
});

describe("computeVegetationSeries", () => {
  const window: SeasonWindow = {
    months: [6, 7, 8, 9],
    label: "June to September",
    rule: "test",
    referenceYears: [2003, 2012, 2021],
    referenceCycle: [],
  };
  // Pixel 0 rises 0.004 a year, pixel 1 is flat, pixel 2 is always fill, pixel 3 lies outside the place.
  function stack(): ModisStack {
    const composites: ModisComposite[] = [];
    for (let y = 2000; y <= 2025; y++) {
      for (const p of seasonPeriods(y, window.months)) {
        composites.push(compositeAt(p, [0.3 + 0.004 * (y - 2000), 0.5, Number.NaN, 0.9]));
      }
    }
    return {
      window: { bounds: [0, 0, 2, 2], width: 2, height: 2 },
      inPlace: Uint8Array.from([1, 1, 1, 0]),
      composites,
      unread: [],
      archiveEnd: "2025-10-15",
    };
  }

  it("gives season means, the area trend and pixel shares over the pixels the product reads", () => {
    const s = computeVegetationSeries(stack(), window);
    expect(s.seasons.map((x) => x.year)).toEqual(Array.from({ length: 26 }, (_, k) => 2000 + k));
    expect(s.placePixels).toBe(3);
    expect(s.analysisPixels).toBe(2);
    expect(s.seasons[0]).toEqual({
      year: 2000,
      meanNdvi: 0.4,
      validPixelShare: 1,
      compositesKept: 8,
      compositesExpected: 8,
    });
    expect(s.areaTrend?.perDecade).toBeCloseTo(0.02, 5);
    expect(s.areaTrend?.seasonsUsed).toBe(26);
    expect(s.areaTrendWithheld).toBeNull();
    expect(s.pixelShares).toMatchObject({
      pixelsTested: 2,
      upward: 0.5,
      includesZero: 0.5,
      fdrUpward: 0.5,
    });
    expect(s.grid.slopePerDecade[0]).toBeCloseTo(0.04, 5);
    expect(Number.isNaN(s.grid.slopePerDecade[2] ?? 0)).toBe(true);
    expect(Number.isNaN(s.grid.seasonMeans[2] ?? 0)).toBe(true);
  });

  it("withholds a season below half its composites and the area trend below 15 seasons, with reasons", () => {
    const st = stack();
    // Keep only 3 of 8 composites in 2000 to 2011: those seasons have no value.
    st.composites = st.composites.filter((c) => {
      const y = Number.parseInt(c.start.slice(0, 4), 10);
      return y >= 2012 || seasonPeriods(y, window.months).indexOf(c.start) < 3;
    });
    const s = computeVegetationSeries(st, window);
    expect(s.seasons[0]).toMatchObject({
      year: 2000,
      meanNdvi: null,
      validPixelShare: 0,
      compositesKept: 3,
    });
    expect(s.yearsUsed).toHaveLength(14);
    expect(s.areaTrend).toBeNull();
    expect(s.areaTrendWithheld).toMatch(/Only 14 of 26 seasons/);
    expect(s.pixelShares).toBeNull();
  });

  it("leaves out a season the archive has not finished", () => {
    const st = stack();
    st.archiveEnd = "2025-09-20";
    expect(computeVegetationSeries(st, window).seasons.at(-1)?.year).toBe(2024);
  });
});

// Test archive listing: one Terra item per 16-day period, every crop answered with the recorded Central Park crop.
function archiveFetch(cropStatus = 200): typeof fetch {
  const impl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/api/stac/v1/search")) {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        datetime: string;
      };
      const year = Number.parseInt(body.datetime.slice(0, 4), 10);
      const features = periodStarts(year)
        .filter((p) => p <= "2026-09-30")
        .map((p, k) => ({
          id: `MOD13Q1.A${year}${String(1 + 16 * k).padStart(3, "0")}.h12v04.061.2026001000000`,
          properties: {
            start_datetime: `${p}T00:00:00Z`,
            end_datetime: new Date(Date.parse(`${p}T00:00:00Z`) + 15 * 86_400_000).toISOString(),
          },
        }));
      return Promise.resolve(Response.json({ features }));
    }
    return Promise.resolve(
      new Response(cropStatus === 200 ? centralParkNpy : "no", { status: cropStatus }),
    );
  };
  return impl;
}

describe("fetchVegetationSeries", () => {
  it("measures a place end to end and names its source, window and method", async () => {
    const r = await fetchVegetationSeries(CENTRAL_PARK_BBOX, undefined, {
      fetchImpl: archiveFetch(),
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    if (r.status !== "measured") throw new Error(`expected measured, got ${JSON.stringify(r)}`);
    expect(r.provenance.source).toBe("modis-13Q1-061");
    expect(r.provenance.method).toEqual({ id: "live_vegetation_trend", version: "1.0.0" });
    // A flat cycle ties every window; the earliest wins.
    expect(r.value.window.months).toEqual([1, 2, 3, 4]);
    expect(r.value.seasons[0]?.year).toBe(2000);
    expect(r.value.seasons.at(-1)?.year).toBe(2026);
    expect(r.value.areaTrend?.perDecade).toBe(0);
    expect(r.value.qaRule).toMatch(/reliability is 0 or 1/);
    expect(r.provenance.items.every((id) => id.startsWith("MOD13Q1."))).toBe(true);
  });

  it("returns a missing value with the reason when the crops cannot be read", async () => {
    const r = await fetchVegetationSeries(CENTRAL_PARK_BBOX, undefined, {
      fetchImpl: archiveFetch(500),
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    expect(r).toMatchObject({ status: "missing", source: "modis-13Q1-061", reason: "http_error" });
    expect(r).not.toHaveProperty("value");
  });
});

describe("live cache", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("stores a measured series once, grids intact, and never stores a missing value", async () => {
    dir = mkdtempSync(join(tmpdir(), "siterra-live-cache-"));
    const key = liveCacheKey(CENTRAL_PARK_BBOX, undefined, "1.0.0");
    let calls = 0;
    const fetcher = () => {
      calls++;
      return fetchVegetationSeries(CENTRAL_PARK_BBOX, undefined, {
        fetchImpl: archiveFetch(),
        now: () => new Date("2026-11-02T12:00:00Z"),
      });
    };
    const first = await cachedLive("vegetation", key, fetcher, dir);
    const second = await cachedLive("vegetation", key, fetcher, dir);
    expect(calls).toBe(1);
    if (first.status !== "measured" || second.status !== "measured")
      throw new Error("expected measured");
    expect(second.value.grid.seasonMeans).toBeInstanceOf(Float32Array);
    expect(Array.from(second.value.grid.seasonMeans)).toEqual(
      Array.from(first.value.grid.seasonMeans),
    );

    const missingKey = liveCacheKey([0, 0, 1, 1], undefined, "1.0.0");
    await cachedLive(
      "vegetation",
      missingKey,
      () =>
        Promise.resolve({
          status: "missing" as const,
          source: "modis-13Q1-061" as const,
          reason: "timeout" as const,
          detail: "test",
          elapsedMs: 1,
        }),
      dir,
    );
    expect(readLiveCache("vegetation", missingKey, dir)).toBeNull();
  });
});
