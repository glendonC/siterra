import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeFrame } from "../instruments/valley/frame";
import { landFrame } from "./geometry";
import { layerStackLayout } from "./layer-layout";

// The layer stack's layout follows the land: for the valley it is specimen A's measured layout again.

const web = (p: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../public/instruments/valley/${p}`, import.meta.url), "utf8"),
  );
const ring = (web("catchment.json") as { ring: [number, number][] }).ring;
const measured = web("layout-a.json") as {
  az: number;
  el: number;
  scale_px_per_km: number;
  target: [number, number, number];
  sheet_y_km: number[];
  plate_xz: [number, number][];
};
const range = { min: 1463.82, max: 4001.64, median: 2588.64 };

describe("layerStackLayout", () => {
  it("gives the valley specimen A's camera, sheets and plate", () => {
    const lf = landFrame(ring, range);
    const frame = makeFrame({ origin_E: 752030, origin_N: 3501980 }, { exag: 1.5, base: lf.base });
    const xz = ring.map(([E, N]): [number, number] => [frame.x(E), frame.z(N)]);
    const L = layerStackLayout(xz, frame.y(range.max), lf.bearing, lf.kmScale);
    expect(L.az).toBeCloseTo(measured.az, 0);
    expect(L.el).toBe(measured.el);
    expect(L.scale_px_per_km).toBeCloseTo(measured.scale_px_per_km, 1);
    L.sheet_y_km.forEach((y, i) => {
      expect(y).toBeCloseTo(measured.sheet_y_km[i] ?? 0, 1);
    });
    L.target.forEach((v, i) => {
      expect(Math.abs(v - (measured.target[i] ?? 0))).toBeLessThan(0.5);
    });
    // the same four corners, in some order, within half a kilometre
    for (const c of measured.plate_xz)
      expect(Math.min(...L.plate_xz.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])))).toBeLessThan(
        0.5,
      );
  });
});
