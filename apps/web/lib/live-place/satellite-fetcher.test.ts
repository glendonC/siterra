import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeRgbaPng, fetchSatelliteLandCover, WORLDCOVER_GRID } from "./satellite-fetcher.ts";

/** A WorldCover crop PNG: `rgb` where `covers(row)` holds, no reading (transparent black) elsewhere. */
function crop(
  size: number,
  rgb: [number, number, number],
  covers: (row: number) => boolean,
): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let r = 0; r < size; r++) {
    if (!covers(r)) continue;
    for (let c = 0; c < size; c++) px.set([...rgb, 255], (r * size + c) * 4);
  }
  return encodeRgbaPng(size, size, px);
}

describe("WorldCover land cover", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("crops every tile of the newest year at full size and merges them where a box spans two", async () => {
    const asked: string[] = [];
    const item = (id: string, year: number) => ({
      id,
      collection: "esa-worldcover",
      properties: { end_datetime: `${String(year)}-12-31T23:59:59Z` },
    });
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      asked.push(url);
      if (url.includes("/api/stac/v1/search")) {
        return Promise.resolve(
          Response.json({
            features: [
              item("ESA_WorldCover_10m_2020_v100_S45E168", 2020),
              item("ESA_WorldCover_10m_2021_v200_S45E168", 2021),
              item("ESA_WorldCover_10m_2021_v200_S48E168", 2021),
            ],
          }),
        );
      }
      const size = Number(/\/(\d+)x\d+\.png/.exec(url)?.[1] ?? 64);
      // the northern tile reads the top half of the box (grassland), the southern one the bottom half (water);
      // the 2020 tile would read it all as tree cover
      const png = url.includes("2020_v100")
        ? crop(size, [0, 100, 0], () => true)
        : url.includes("S45E168")
          ? crop(size, [255, 255, 76], (r) => r < size / 2)
          : crop(size, [0, 100, 200], (r) => r >= size / 2);
      return Promise.resolve(new Response(new Uint8Array(png), { status: 200 }));
    });

    const sat = await fetchSatelliteLandCover([168.53, -45.12, 168.79, -44.94]);
    expect(sat.worldCoverYear).toBe(2021);
    expect(sat.landCoverGrid?.width).toBe(WORLDCOVER_GRID);
    expect(sat.landCoverGrid?.height).toBe(WORLDCOVER_GRID);
    expect(sat.grasslandPct).toBe(50);
    expect(sat.waterPct).toBe(50);
    expect(sat.treeCoverPct).toBe(0);
    const crops = asked.filter((u) => u.includes("/item/crop/"));
    expect(
      crops.every((u) => u.includes(`${String(WORLDCOVER_GRID)}x${String(WORLDCOVER_GRID)}`)),
    ).toBe(true);
    expect(crops.some((u) => u.includes("2020_v100"))).toBe(false);
  });
});
