import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClimateYearRow,
  computeStatsFromAnnual,
  fetchHistoricalClimate,
  yearlyRowsFromDaily,
} from "./climate-series.ts";

function dailyArchive(skip: (date: string) => boolean = () => false) {
  const time: string[] = [];
  const precipitation_sum: Array<number | null> = [];
  const et0_fao_evapotranspiration: Array<number | null> = [];
  for (let d = Date.UTC(2000, 0, 1); d <= Date.UTC(2024, 11, 31); d += 86_400_000) {
    const date = new Date(d).toISOString().slice(0, 10);
    const year = Number(date.slice(0, 4));
    time.push(date);
    // one mm a day plus a tenth of a mm a day more each year: a known precipitation trend
    precipitation_sum.push(skip(date) ? null : 1 + (year - 2000) * 0.1);
    et0_fao_evapotranspiration.push(2);
  }
  return { time, precipitation_sum, et0_fao_evapotranspiration };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("live climate series", () => {
  it("states vegetation as not measured and carries no vegetation number", () => {
    const years: ClimateYearRow[] = [];
    for (let yr = 2000; yr <= 2024; yr++) years.push({ year: yr, precipMm: 500, et0Mm: 900 });
    const summary = computeStatsFromAnnual(years);
    expect(summary.vegetation.status).toBe("not_measured");
    const keys: string[] = [];
    JSON.stringify(summary, (k, v: unknown) => (keys.push(k), v));
    expect(keys.filter((k) => /ndvi|rSquared|FdrShare|lowBand/i.test(k))).toEqual([]);
    expect(summary.source.kind).toBe("open_meteo_archive");
    expect(summary.source.window).toBe("2000 to 2024");
  });

  it("leaves out a year with a missing day instead of filling it", () => {
    const rows = yearlyRowsFromDaily(dailyArchive((date) => date === "2013-07-04"));
    expect(rows.map((r) => r.year)).not.toContain(2013);
    expect(rows).toHaveLength(24);
    expect(rows.find((r) => r.year === 2012)?.precipMm).toBeCloseTo(366 * 2.2, 1);
    expect(rows.find((r) => r.year === 2001)?.et0Mm).toBeCloseTo(730, 1);
  });

  it("computes the precipitation trend and its 95% interval from the yearly totals", () => {
    const years: ClimateYearRow[] = [];
    for (let yr = 2000; yr <= 2024; yr++)
      years.push({
        year: yr,
        precipMm: 400 + (yr - 2000) * 3 + (yr % 2 === 0 ? 5 : -5),
        et0Mm: null,
      });
    const s = computeStatsFromAnnual(years);
    expect(s.precipTrendMmPerDecade).toBeCloseTo(30, 0);
    const trend = s.precipTrendMmPerDecade ?? NaN;
    expect(s.precipTrendLowerMmPerDecade ?? Infinity).toBeLessThan(trend);
    expect(s.precipTrendUpperMmPerDecade ?? -Infinity).toBeGreaterThan(trend);
  });

  it("names Open-Meteo as the source of a fetched series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ daily: dailyArchive() }), { status: 200 })),
      ),
    );
    const s = await fetchHistoricalClimate(-74.006, 40.713);
    expect(s.source.kind).toBe("open_meteo_archive");
    expect(s.source.url).toBe("https://archive-api.open-meteo.com/v1/archive");
    expect(s.years).toHaveLength(25);
    expect(s.years.every((r) => !("ndvi" in r))).toBe(true);
    expect(s.vegetation.status).toBe("not_measured");
  });

  it("is a blocked state with no series when Open-Meteo does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("getaddrinfo ENOTFOUND archive-api.open-meteo.com"))),
    );
    const s = await fetchHistoricalClimate(-74.006, 40.713);
    expect(s.status).toBe("unavailable");
    expect(s.years).toEqual([]);
    expect(s.precipTrendMmPerDecade).toBeNull();
    expect(s.unavailableReason).toMatch(
      /^Source unavailable: the Open-Meteo Historical Weather API/,
    );
    expect(s.unavailableReason).toContain("ENOTFOUND");
  });

  it("names the wait when the archive is too slow, instead of inventing a series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          }),
      ),
    );
    const s = await fetchHistoricalClimate(-74.006, 40.713, 30);
    expect(s.status).toBe("unavailable");
    expect(s.unavailableReason).toContain("no answer within 0 s");
    expect(s.years).toEqual([]);
  });

  it("is blocked when fewer than 20 complete years come back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              daily: dailyArchive((date) => date.endsWith("-12-31") && date < "2010"),
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const s = await fetchHistoricalClimate(-74.006, 40.713);
    expect(s.status).toBe("unavailable");
    expect(s.unavailableReason).toContain("15 complete calendar years returned, 20 needed");
  });
});
