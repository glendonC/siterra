import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pixelColours as C } from "../theme/obsidian";
import { rainCellsFrom, slopeCellsFrom, slopeColour } from "./footprint";

// The footprints come from the bundles' own assets: every cell's continuous slope (never a significance class), and
// the CHIRPS cells with the share of each inside the catchment.

const B = new URL("../../../../data/bundles/", import.meta.url);
const read = (p: string): unknown => JSON.parse(readFileSync(new URL(p, B), "utf8"));

describe("slopeCellsFrom", () => {
  const s = slopeCellsFrom(
    read("bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-mar_jun-cells.json"),
  );

  it("reads all 8,094 cells with their corners and slopes, on the asset's own scale", () => {
    expect(s.cells).toHaveLength(8094);
    expect(s.cells[0]).toEqual({
      corners: [
        [762525.4, 3516993],
        [762757.6, 3516998.9],
        [762776.7, 3516768.2],
        [762544.6, 3516762.3],
      ],
      slope: 0.00821,
    });
    expect([s.domain, s.neutral]).toEqual([0.05, 0.0025]);
  });

  it("colours a slope by its sign and size only: neutral near zero, the arms beyond", () => {
    expect(slopeColour(0.001, 0.05, 0.0025)).toBe(C.slopeNeutral);
    expect(slopeColour(-0.001, 0.05, 0.0025)).toBe(C.slopeNeutral);
    expect(slopeColour(0.05, 0.05, 0.0025)).toBe("rgb(87 212 174)");
    expect(slopeColour(-0.05, 0.05, 0.0025)).toBe("rgb(242 168 95)");
    expect(slopeColour(0.2, 0.05, 0.0025)).toBe(slopeColour(0.05, 0.05, 0.0025));
  });
});

describe("rainCellsFrom", () => {
  it("reads the 33 CHIRPS cells as rings in the model's projection with the share of each inside", () => {
    const r = rainCellsFrom(read("bundle_chirps_monthly_ait_bouguemez/rainfall-cells.geojson"));
    expect(r).toHaveLength(33);
    expect(r[0]?.id).toBe("chirps_r564_c3473");
    expect(r[0]?.inside).toBe(0.007896);
    expect(r[0]?.ring).toHaveLength(5);
    for (const c of r) expect(c.inside).toBeGreaterThan(0);
  });

  it("places every cell over the catchment the trend cells cover, in the same projection", () => {
    // the trend cells tile the catchment in UTM 29N; a CHIRPS cell (0.05 degrees, about 5.5 km) that touches the
    // catchment has its centre within one cell of their extent, and the most-inside cell's centre inside it
    const s = slopeCellsFrom(
      read("bundle_pixel_trend_long_record_ait_bouguemez/pixel-trend-mar_jun-cells.json"),
    );
    const xs = s.cells.flatMap((c) => c.corners.map(([x]) => x));
    const ys = s.cells.flatMap((c) => c.corners.map(([, y]) => y));
    const box = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
    };
    const centre = (ring: readonly (readonly number[])[]) => {
      const pts = ring.slice(0, -1);
      return [
        pts.reduce((a, p) => a + (p[0] ?? 0), 0) / pts.length,
        pts.reduce((a, p) => a + (p[1] ?? 0), 0) / pts.length,
      ] as const;
    };
    const r = rainCellsFrom(read("bundle_chirps_monthly_ait_bouguemez/rainfall-cells.geojson"));
    const CELL = 5600;
    for (const c of r) {
      const [x, y] = centre(c.ring);
      expect(x).toBeGreaterThan(box.x0 - CELL);
      expect(x).toBeLessThan(box.x1 + CELL);
      expect(y).toBeGreaterThan(box.y0 - CELL);
      expect(y).toBeLessThan(box.y1 + CELL);
    }
    const most = r.reduce((a, b) => (b.inside > a.inside ? b : a));
    const [mx, my] = centre(most.ring);
    expect(mx).toBeGreaterThan(box.x0);
    expect(mx).toBeLessThan(box.x1);
    expect(my).toBeGreaterThan(box.y0);
    expect(my).toBeLessThan(box.y1);
  });
});
