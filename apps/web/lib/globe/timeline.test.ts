import { describe, expect, it } from "vitest";
import { globeCamera } from "./frame";
import { DIVE_S, KEY, RECORDING, V_END, globeStateAt, progress, sunFor } from "./timeline";
import { V_GLOBE } from "./views";

describe("globeStateAt", () => {
  it("shows the limb with dots and no valley during the opening", () => {
    const s = globeStateAt(3.6, RECORDING);
    expect(s.uniforms.mode).toEqual([0, 1, 0, 0]);
    expect(s.valleyOpacity).toBe(0);
    expect(s.done).toBe(false);
  });

  it("has turned to the globe view before the dive starts", () => {
    const s = globeStateAt(RECORDING.dive - 0.01, RECORDING);
    expect(s.view.lon).toBeCloseTo(V_GLOBE.lon, 6);
    expect(s.view.lat).toBeCloseTo(V_GLOBE.lat, 6);
    expect(s.view.distance).toBeCloseTo(V_GLOBE.distance, 3);
  });

  it("ends the dive exactly on the approved arrival pose with the valley fully in", () => {
    const s = globeStateAt(RECORDING.dive + DIVE_S, RECORDING);
    expect(s.view.lon).toBeCloseTo(V_END.lon, 9);
    expect(s.view.lat).toBeCloseTo(V_END.lat, 9);
    expect(s.view.bearing).toBeCloseTo(133, 9);
    expect(s.view.pitch).toBeCloseTo(36, 9);
    expect(s.view.distance).toBeCloseTo(73.3887, 6);
    expect(s.valleyOpacity).toBe(1);
    expect(s.valleyExaggeration).toBe(2);
    expect(s.done).toBe(true);
  });

  it("disposes the globe when the valley covers it, but keeps driving the camera to the pose", () => {
    const s = globeStateAt(RECORDING.dive + 3.2, RECORDING);
    expect(s.globeDone).toBe(true);
    expect(s.done).toBe(false);
  });

  it("fades the valley in where the study's valley block came in (dive 2.5 to 3.1 s)", () => {
    expect(globeStateAt(RECORDING.dive + 2.5, RECORDING).valleyOpacity).toBe(0);
    expect(globeStateAt(RECORDING.dive + 2.8, RECORDING).valleyOpacity).toBeCloseTo(0.5, 9);
    expect(globeStateAt(RECORDING.dive + 3.1, RECORDING).valleyOpacity).toBe(1);
  });

  it("names the Atlas on the globe, then the High Atlas early in the dive, then lets the valley's name take over", () => {
    const d = RECORDING.dive;
    expect(globeStateAt(d - 1, RECORDING)).toMatchObject({
      rangeName: 0,
      rangeOpacity: 1,
      valleyNameOpacity: 0,
    });
    expect(globeStateAt(d + 1.5, RECORDING)).toMatchObject({ rangeName: 1, rangeOpacity: 1 });
    expect(globeStateAt(d + 3, RECORDING)).toMatchObject({ rangeOpacity: 0, valleyNameOpacity: 1 });
  });

  it("waits for the viewer: nothing turns until the action is pressed", () => {
    const s = globeStateAt(100, { beats: [0.6] });
    expect(s.view.lon).not.toBeCloseTo(V_GLOBE.lon, 1);
    expect(s.valleyOpacity).toBe(0);
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
  it("is the study's key light, 1, 0.957, 0.902", () => {
    expect(KEY[0]).toBe(1);
    expect(KEY[1]).toBeCloseTo(0.957, 3);
    expect(KEY[2]).toBeCloseTo(0.902, 3);
  });
});
