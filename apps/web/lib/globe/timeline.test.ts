import { describe, expect, it } from "vitest";
import { globeCamera } from "./frame";
import { KEY, RECORDING, ZOOM_S, globeStateAt, progress, sunFor } from "./timeline";
import { V_GLOBE } from "./views";

describe("globeStateAt", () => {
  it("shows the limb with dots during the opening", () => {
    const s = globeStateAt(3.6, RECORDING);
    expect(s.uniforms.mode).toEqual([0, 1, 0, 0]);
    expect(s.uniforms.fade?.[2]).toBe(0);
    expect(s.done).toBe(false);
  });

  it("has turned to the globe view before Open", () => {
    const s = globeStateAt(RECORDING.dive - 0.01, RECORDING);
    expect(s.view.lon).toBeCloseTo(V_GLOBE.lon, 6);
    expect(s.view.lat).toBeCloseTo(V_GLOBE.lat, 6);
    expect(s.view.distance).toBeCloseTo(V_GLOBE.distance, 3);
  });

  it("zooms straight down onto the case, north up, and ends on the ground with the ring kept", () => {
    const mid = globeStateAt(RECORDING.dive + ZOOM_S / 2, RECORDING);
    expect(mid.view.pitch).toBe(90);
    expect(mid.view.bearing).toBe(180);
    expect(mid.view.distance).toBeLessThan(V_GLOBE.distance);
    const s = globeStateAt(RECORDING.dive + ZOOM_S, RECORDING);
    expect(s.view.lon).toBeCloseTo(-6.5372222, 9);
    expect(s.view.lat).toBeCloseTo(31.6377778, 9);
    expect(s.view.pitch).toBe(90);
    // the earth has sunk wholly into the ground: no picture of the place is left on the globe
    expect(s.uniforms.fade?.[0]).toBe(0);
    expect(s.uniforms.fade?.[2]).toBeCloseTo(1, 9);
    expect(s.uniforms.mode).toEqual([0, 1, 0, 0]);
    expect(s.ringOpacity).toBe(1);
    expect(s.rangeOpacity).toBe(0);
    expect(s.done).toBe(true);
  });

  it("takes about a second and a half from Open to the handover", () => {
    expect(ZOOM_S).toBeGreaterThanOrEqual(1);
    expect(ZOOM_S).toBeLessThanOrEqual(1.6);
    expect(globeStateAt(RECORDING.dive + ZOOM_S - 0.05, RECORDING).done).toBe(false);
  });

  it("waits for the viewer: nothing turns until the action is pressed", () => {
    const s = globeStateAt(100, { beats: [0.6] });
    expect(s.view.lon).not.toBeCloseTo(V_GLOBE.lon, 1);
    expect(s.done).toBe(false);
  });
});

describe("progress", () => {
  it("cuts in 150 ms under reduced motion", () => {
    expect(progress(10.15, 10, 1.6, undefined, true)).toBe(1);
    expect(progress(10.075, 10, 1.6, undefined, true)).toBeCloseTo(0.5, 9);
  });
});

describe("sunFor", () => {
  it("returns a unit vector at both ends of the turn", () => {
    const cam = globeCamera(
      { lon: -3, lat: 25, bearing: 180, pitch: 90, distance: 20000, fov: 22 },
      16 / 9,
    );
    for (const k of [0, 1]) {
      const s = sunFor(cam, k);
      expect(Math.hypot(...s)).toBeCloseTo(1, 9);
    }
  });
});

describe("KEY", () => {
  it("is the overview's key light, so the globe and the land are lit alike", () => {
    // overviewColours.keyLight #ffd9ae
    expect(KEY[0]).toBe(1);
    expect(KEY[1]).toBeCloseTo(0xd9 / 255, 3);
    expect(KEY[2]).toBeCloseTo(0xae / 255, 3);
  });
});
