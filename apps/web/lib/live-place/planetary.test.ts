import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LIVE_SOURCES,
  MODIS_250M_PIXEL_M,
  fetchNpyCrop,
  fetchWithRetry,
  mapLimited,
  missingFrom,
  modisWindowForBbox,
  npyCropUrl,
  parseNpy,
  stacSearch,
  withTimeout,
} from "./planetary.ts";

// Recorded 2 Nov 2026: data API crop of MOD13Q1.A2026273.h12v04.061.2026289235849 over Central Park, New York, on
// the native sinusoidal grid (window -26890..-26876 by 19572..19580 pixels), assets NDVI then pixel reliability.
// Row 4 was checked pixel by pixel against the data API point endpoint at each pixel centre.
const centralPark = new Uint8Array(
  readFileSync(new URL("./fixtures/modis-mod13q1-a2026273-central-park.npy", import.meta.url)),
);
const ROW4_NDVI = [
  -3000, -3000, -3000, -3000, 3917, 7415, 8272, 8272, 5888, 3050, 1806, 2417, -3000, -3000,
];

describe("parseNpy", () => {
  it("reads a recorded MODIS crop with the mask as the last band", () => {
    const arr = parseNpy(centralPark);
    if (!arr) throw new Error("fixture did not parse");
    expect(arr.dtype).toBe("int16");
    expect(arr.shape).toEqual([3, 8, 14]);
    const plane = 8 * 14;
    const data = arr.data;
    expect(Array.from(data.subarray(4 * 14, 5 * 14))).toEqual(ROW4_NDVI);
    expect(Array.from(data.subarray(plane + 4 * 14, plane + 5 * 14))).toEqual([
      -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1,
    ]);
    for (let i = 0; i < plane; i++) {
      expect(data[2 * plane + i]).toBe(data[i] === -3000 ? 0 : 255);
    }
  });

  it("rejects bytes that are not an npy file", () => {
    expect(parseNpy(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]))).toBeNull();
    expect(parseNpy(centralPark.subarray(0, 120))).toBeNull();
  });
});

describe("modisWindowForBbox", () => {
  it("snaps a lon/lat box to the native 231.66 m grid of the recorded crop", () => {
    const w = modisWindowForBbox([-73.975, 40.775, -73.955, 40.79]);
    expect(w.width).toBe(14);
    expect(w.height).toBe(8);
    expect(w.bounds[0] / MODIS_250M_PIXEL_M).toBeCloseTo(-26890, 6);
    expect(w.bounds[1] / MODIS_250M_PIXEL_M).toBeCloseTo(19572, 6);
    expect(w.bounds[2] / MODIS_250M_PIXEL_M).toBeCloseTo(-26876, 6);
    expect(w.bounds[3] / MODIS_250M_PIXEL_M).toBeCloseTo(19580, 6);
  });
});

describe("data API client", () => {
  it("builds a native-grid crop URL and decodes the response", async () => {
    const urls: string[] = [];
    const fetchImpl = ((input: RequestInfo | URL) => {
      urls.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(new Response(centralPark, { status: 200 }));
    }) as typeof fetch;
    const arr = await fetchNpyCrop(
      {
        collection: "modis-13Q1-061",
        item: "MOD13Q1.A2026273.h12v04.061.2026289235849",
        assets: ["250m_16_days_NDVI", "250m_16_days_pixel_reliability"],
        bounds: [-6229239.47, 4533978.24, -6225996.29, 4535831.5],
        crs: "+proj=sinu +R=6371007.181",
      },
      { fetchImpl },
    );
    expect(arr.shape).toEqual([3, 8, 14]);
    const url = new URL(urls[0] ?? "");
    expect(url.pathname).toBe(
      "/api/data/v1/item/bbox/-6229239.47,4533978.24,-6225996.29,4535831.5.npy",
    );
    expect(url.searchParams.getAll("assets")).toEqual([
      "250m_16_days_NDVI",
      "250m_16_days_pixel_reliability",
    ]);
    expect(url.searchParams.get("coord_crs")).toBe("+proj=sinu +R=6371007.181");
    expect(url.searchParams.get("dst_crs")).toBe("+proj=sinu +R=6371007.181");
  });

  it("adds an output size only when both sides are given", () => {
    const base = {
      collection: "c",
      item: "i",
      assets: ["data"],
      bounds: [0, 1, 2, 3] as [number, number, number, number],
    };
    expect(new URL(npyCropUrl(base)).pathname).toBe("/api/data/v1/item/bbox/0,1,2,3.npy");
    expect(new URL(npyCropUrl({ ...base, width: 64, height: 32 })).pathname).toBe(
      "/api/data/v1/item/bbox/0,1,2,3/64x32.npy",
    );
  });

  it("turns HTTP failures into a missing value with a stated reason, never a number", async () => {
    const started = Date.now();
    const fetchImpl = (() =>
      Promise.resolve(new Response("broken", { status: 500 }))) as typeof fetch;
    const err = await stacSearch({ collections: ["modis-13Q1-061"] }, { fetchImpl }).catch(
      (e: unknown) => e,
    );
    const missing = missingFrom("modis-13Q1-061", err, started);
    expect(missing).toMatchObject({
      status: "missing",
      reason: "http_error",
      source: "modis-13Q1-061",
    });
    expect(missing.detail).toContain("HTTP 500");
    expect(missing).not.toHaveProperty("value");
  });

  it("reports a timeout as a timeout", async () => {
    const t = withTimeout(5);
    const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as typeof fetch;
    const started = Date.now();
    const err = await stacSearch({}, { fetchImpl, signal: t.signal }).catch((e: unknown) => e);
    t.clear();
    expect(missingFrom("sentinel-2-l2a", err, started, t.signal).reason).toBe("timeout");
  });
});

describe("fetchWithRetry", () => {
  it("waits out HTTP 429 using Retry-After and returns the next answer", async () => {
    const statuses = [429, 429, 200];
    let calls = 0;
    const fetchImpl = (() => {
      const status = statuses[calls++] ?? 200;
      return Promise.resolve(new Response("x", { status, headers: { "retry-after": "0" } }));
    }) as typeof fetch;
    const res = await fetchWithRetry("https://example.test/", {}, { fetchImpl });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("does not retry a plain HTTP error", async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls++;
      return Promise.resolve(new Response("x", { status: 404 }));
    }) as typeof fetch;
    expect((await fetchWithRetry("https://example.test/", {}, { fetchImpl })).status).toBe(404);
    expect(calls).toBe(1);
  });
});

describe("mapLimited", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimited([5, 1, 4, 2, 3, 0], 2, async (ms, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});

describe("LIVE_SOURCES", () => {
  it("names a license, an attribution and where each was read for every source", () => {
    expect(LIVE_SOURCES.map((s) => s.id).sort()).toEqual(
      [
        "3dep-seamless",
        "cop-dem-glo-30",
        "io-lulc-annual-v02",
        "meta-wri-chm-v1",
        "modis-13Q1-061",
        "sentinel-2-l2a",
      ].sort(),
    );
    for (const s of LIVE_SOURCES) {
      expect(s.license.length).toBeGreaterThan(0);
      expect(s.attribution.length).toBeGreaterThan(0);
      expect(s.verifiedFrom.length).toBeGreaterThan(0);
    }
  });
});
