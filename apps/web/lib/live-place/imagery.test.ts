import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchTrueColour, groupAcquisitions, imageSize, sclShares } from "./imagery.ts";
import type { Bbox, StacItem } from "./planetary.ts";

// Recorded 2 Nov 2026 by wrapping fetch around fetchTrueColour(Central Park box, size 32, 3 candidates, now
// 2026-11-02T12:00Z): the STAC listing (trimmed), the SCL crop of each candidate and the chosen true-colour PNG.
const dir = "./fixtures/sentinel2-central-park/";
const read = (name: string) => new Uint8Array(readFileSync(new URL(dir + name, import.meta.url)));
const stac = readFileSync(new URL(dir + "stac.json", import.meta.url));
const OCT = "S2C_MSIL2A_20261006T155131_R054_T18TWL_20261006T185302";
const MAR = "S2A_MSIL2A_20260309T154711_R011_T18TWL_20260309T222622";
const NOV = "S2B_MSIL2A_20251102T154319_R011_T18TWL_20251102T193858";
const visualOct = read(`visual-${OCT}.png`);
const BBOX: Bbox = [-73.975, 40.775, -73.955, 40.79];

function archive(overrides: Record<string, Uint8Array<ArrayBuffer>> = {}): typeof fetch {
  const impl = (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/api/stac/v1/search"))
      return Promise.resolve(new Response(stac, { status: 200 }));
    const u = new URL(url);
    const item = u.searchParams.get("item") ?? "";
    if (u.searchParams.get("assets") === "SCL") {
      return Promise.resolve(
        new Response(overrides[item] ?? read(`scl-${item}.npy`), { status: 200 }),
      );
    }
    // Every true-colour request is answered with the recorded October PNG (test input for other scenes).
    return Promise.resolve(new Response(visualOct, { status: 200 }));
  };
  return impl;
}

describe("fetchTrueColour", () => {
  it("picks the clearest acquisition in the box, the most recent on a tie, with date and notice", async () => {
    const r = await fetchTrueColour(BBOX, {
      fetchImpl: archive(),
      size: 32,
      maxCandidates: 3,
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    if (r.status !== "measured") throw new Error(`expected an image, got ${JSON.stringify(r)}`);
    expect(r.value.itemIds).toEqual([OCT]);
    expect(r.value.datetime).toBe("2026-10-06T15:51:31.025000Z");
    expect(r.value.boxCloudPct).toBe(0);
    expect(r.value.sceneCloudPct).toBe(0);
    expect(r.value.attribution).toBe("Contains modified Copernicus Sentinel data 2026");
    expect([r.value.width, r.value.height]).toEqual([32, 32]);
    expect(r.value.rgba).toHaveLength(32 * 32 * 4);
    expect(r.value.png).toEqual(visualOct);
    expect(r.provenance).toMatchObject({
      source: "sentinel-2-l2a",
      window: { start: "2026-10-06", end: "2026-10-06" },
      method: { id: "live_true_colour", version: "1.0.0" },
    });
  });

  it("passes over a scene whose own classification shows cloud in the box", async () => {
    const cloudy = read(`scl-${OCT}.npy`).slice();
    const headerLen = cloudy.length - 2 * 64 * 64;
    cloudy.fill(9, headerLen, headerLen + 1000); // SCL 9: cloud, high probability
    const r = await fetchTrueColour(BBOX, {
      fetchImpl: archive({ [OCT]: cloudy }),
      size: 32,
      maxCandidates: 3,
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    if (r.status !== "measured") throw new Error("expected an image");
    expect(r.value.itemIds).toEqual([MAR]);
  });

  it("passes over a scene that leaves part of the box unseen, and is missing when none covers it", async () => {
    const empty = read(`scl-${NOV}.npy`).slice();
    empty.fill(0, empty.length - 64 * 64); // mask band all zero: no data
    const r = await fetchTrueColour(BBOX, {
      fetchImpl: archive({ [OCT]: empty, [MAR]: empty, [NOV]: empty }),
      size: 32,
      maxCandidates: 3,
      now: () => new Date("2026-11-02T12:00:00Z"),
    });
    expect(r).toMatchObject({
      status: "missing",
      source: "sentinel-2-l2a",
      reason: "coverage_below_threshold",
    });
    expect(r).not.toHaveProperty("value");
  });
});

describe("groupAcquisitions", () => {
  it("joins the MGRS tiles of one pass and orders by granule cloud, then most recent", () => {
    const item = (id: string, dt: string, cloud: number, orbit = 137): StacItem => ({
      id,
      properties: {
        datetime: dt,
        platform: "Sentinel-2B",
        "eo:cloud_cover": cloud,
        "sat:relative_orbit": orbit,
      },
    });
    const g = groupAcquisitions([
      item("b", "2026-05-20T11:06:19Z", 0.03),
      item("a", "2026-05-20T11:06:19Z", 0.5),
      item("c", "2026-09-12T11:06:31Z", 0.5),
    ]);
    expect(g.map((x) => x.itemIds)).toEqual([["c"], ["a", "b"]]);
    expect(g[1]?.sceneCloudPct).toBe(0.5);
  });
});

describe("sclShares and imageSize", () => {
  it("counts cloud and shadow classes and no data", () => {
    expect(sclShares(Uint8Array.from([4, 5, 8, 3, 0, 11, 10, 6]))).toEqual({
      cloud: 0.375,
      noData: 0.125,
    });
  });

  it("keeps the ground aspect of the box", () => {
    expect(imageSize([0, 0, 2, 1], 1024)).toEqual({ width: 1024, height: 512 });
    expect(imageSize([-73.975, 40.775, -73.955, 40.79], 32)).toEqual({ width: 32, height: 32 });
  });
});
