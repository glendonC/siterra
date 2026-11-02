import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classesFromCrop,
  computeLandCoverChange,
  fetchLandCoverChange,
} from "./landcover-change.ts";
import { type Bbox, parseNpy } from "./planetary.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
// Recorded 2 Nov 2026: io-lulc-annual-v02 items 18T-2017 and 18T-2023 over Central Park, 32 x 32 nearest samples,
// class band then mask band. Five landmarks were checked against the data API point endpoint (Reservoir water,
// Ramble trees, Great Lawn rangeland, buildings on Fifth Avenue and Central Park West built area).
const crop2017 = new Uint8Array(fixture("io-lulc-18t-2017-central-park.npy"));
const crop2023 = new Uint8Array(fixture("io-lulc-18t-2023-central-park.npy"));
// Recorded 2 Nov 2026: the STAC search for the same box (seven annual items of UTM zone 18T).
const stacCentralPark = fixture("io-lulc-stac-central-park.json");
const BBOX: Bbox = [-73.975, 40.775, -73.955, 40.79];

function classes(bytes: Uint8Array): Uint8Array {
  const arr = parseNpy(bytes);
  if (!arr) throw new Error("fixture did not parse");
  return classesFromCrop(arr, 32, 32);
}

const allIn = new Uint8Array(32 * 32).fill(1);

// Expected values counted from the same fixtures with a separate Python reader.
describe("computeLandCoverChange", () => {
  it("gives shares per year and the classes that changed between the first and last year", () => {
    const c = computeLandCoverChange(
      [
        { year: 2023, itemIds: ["18T-2023"], classes: classes(crop2023) },
        { year: 2017, itemIds: ["18T-2017"], classes: classes(crop2017) },
      ],
      { width: 32, height: 32, bbox: BBOX, inPlace: allIn },
    );
    expect(c.firstYear).toBe(2017);
    expect(c.lastYear).toBe(2023);
    expect(c.years[0]?.shares).toMatchObject({
      water: 0.165,
      trees: 0.1396,
      built_area: 0.6865,
      rangeland: 0.0088,
    });
    expect(c.years[1]?.shares).toMatchObject({
      water: 0.1631,
      trees: 0.1191,
      built_area: 0.709,
      rangeland: 0.0088,
    });
    expect(c.years[0]?.noReadingShare).toBe(0);
    expect(c.comparedPoints).toBe(1024);
    expect(c.changedShare).toBe(0.0586);
    expect(c.transitions.slice(0, 4)).toEqual([
      { from: "trees", to: "built_area", share: 0.0244 },
      { from: "water", to: "built_area", share: 0.0098 },
      { from: "built_area", to: "water", share: 0.0088 },
      { from: "built_area", to: "rangeland", share: 0.0039 },
    ]);
    expect(c.transitions).toHaveLength(8);
  });

  it("leaves cloud, no data and points outside the place out of shares and change", () => {
    // Synthetic test input: four points; point 1 is cloud (10) in the first year, point 3 is outside the place.
    const first = Uint8Array.from([2, 10, 5, 7]);
    const last = Uint8Array.from([7, 2, 5, 1]);
    const c = computeLandCoverChange(
      [
        { year: 2017, itemIds: ["a"], classes: classesFrom(first) },
        { year: 2023, itemIds: ["b"], classes: classesFrom(last) },
      ],
      { width: 2, height: 2, bbox: BBOX, inPlace: Uint8Array.from([1, 1, 1, 0]) },
    );
    expect(c.years[0]?.noReadingShare).toBe(0.3333);
    expect(c.years[0]?.shares).toMatchObject({ trees: 0.5, crops: 0.5, built_area: 0 });
    expect(c.comparedPoints).toBe(2);
    expect(c.changedShare).toBe(0.5);
    expect(c.transitions).toEqual([{ from: "trees", to: "built_area", share: 0.5 }]);
  });
});

/** Builds a 2-band crop (classes, mask 255) and reads it back, so cloud codes go through the same filter. */
function classesFrom(codes: Uint8Array): Uint8Array {
  const n = codes.length;
  const data = new Uint8Array(2 * n);
  data.set(codes, 0);
  data.fill(255, n);
  return classesFromCrop({ dtype: "uint8", shape: [2, 2, 2], data }, 2, 2);
}

describe("fetchLandCoverChange", () => {
  function archive(cropStatus = 200): typeof fetch {
    const impl = (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith("/api/stac/v1/search")) {
        return Promise.resolve(new Response(stacCentralPark, { status: 200 }));
      }
      if (cropStatus !== 200) return Promise.resolve(new Response("no", { status: cropStatus }));
      const item = new URL(url).searchParams.get("item");
      return Promise.resolve(
        new Response(item === "18T-2017" ? crop2017 : crop2023, { status: 200 }),
      );
    };
    return impl;
  }

  it("reads every year at the same points and names source, years and method", async () => {
    const r = await fetchLandCoverChange(BBOX, undefined, {
      fetchImpl: archive(),
      gridSize: 32,
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    if (r.status !== "measured") throw new Error(`expected measured, got ${JSON.stringify(r)}`);
    expect(r.value.years.map((y) => y.year)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023]);
    expect(r.value.changedShare).toBe(0.0586);
    expect(r.provenance).toMatchObject({
      source: "io-lulc-annual-v02",
      window: { start: "2017-01-01", end: "2023-12-31" },
      method: { id: "live_landcover_change", version: "1.0.0" },
    });
    expect(r.provenance.items).toHaveLength(7);
  });

  it("returns a missing value with the reason when a year cannot be read", async () => {
    const r = await fetchLandCoverChange(BBOX, undefined, {
      fetchImpl: archive(404),
      gridSize: 32,
    });
    expect(r).toMatchObject({
      status: "missing",
      source: "io-lulc-annual-v02",
      reason: "http_error",
    });
    expect(r).not.toHaveProperty("value");
  });

  it("refuses a crop of the wrong size", () => {
    const arr = parseNpy(crop2017);
    if (!arr) throw new Error("fixture did not parse");
    expect(() => classesFromCrop(arr, 64, 64)).toThrow(/expected 2 x 64 x 64/);
  });
});
