import { DataTexture, FloatType, RedFormat, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { makeFrame } from "../../instruments/valley/frame";
import { centreOf } from "../data";
import { createRelief, createSurveyPlan, maskOnRelief, signedArea, smoothRing } from "./terrain";

describe("the overview's land helpers", () => {
  it("reads the catchment mask from the land cover raster's blue channel onto the relief cells", () => {
    // a 2 x 2 relief grid of 30 m cells over a 6 x 6 analysis grid of 10 m cells; inside only in the top-left 3 x 3
    const a = { E0: 0, N0: 60, res: 10, width: 6, height: 6 };
    const g = { E0: 0, N0: 60, res: 30, width: 2, height: 2 };
    const px = new Uint8ClampedArray(6 * 6 * 4);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px[(r * 6 + c) * 4 + 2] = 255;
    expect([...maskOnRelief(px, a, g)]).toEqual([1, 0, 0, 0]);
  });

  it("smooths a closed ring by a moving average and drops its closing vertex", () => {
    const ring: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
      [0, 0],
    ];
    const s = smoothRing(ring, 1);
    expect(s).toHaveLength(4);
    expect(s[0]).toEqual([1, 1]);
  });

  it("gives the signed area, positive counter-clockwise with north up", () => {
    const ccw: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    expect(signedArea(ccw)).toBe(4);
    expect(signedArea([...ccw].reverse())).toBe(-4);
  });

  it("puts a pixel's centre at the mean of its corners", () => {
    expect(
      centreOf([
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 2],
      ]),
    ).toEqual([2, 1]);
  });
});

describe("the measurement front", () => {
  const g = { E0: 0, N0: 60, res: 30, width: 2, height: 2 };
  const frame = makeFrame({ origin_E: 30, origin_N: 30 }, { exag: 2.5, base: 0 });
  const hTex = new DataTexture(new Float32Array(4), 2, 2, RedFormat, FloatType);
  const light = {
    dir: new Vector3(0, 1, 0),
    color: new Vector3(1, 1, 1),
    ambient: new Vector3(0.5, 0.5, 0.5),
    sky: new Vector3(0.5, 0.6, 0.7),
  };
  const rect: [number, number, number, number] = [-0.03, -0.03, 0.03, 0.03];
  const relief = createRelief(new Float32Array(4), g, frame, hTex, rect, {
    hTex,
    light,
    lightMap: hTex,
    colours: {
      albedo: "#a6a8a3",
      line: "#e9eef0",
      treeC: "#5c8f63",
      cropC: "#93b872",
      limitC: [1, 1, 1],
      fogC: "#10181b",
      rimC: "#a9c9d4",
      scanC: "#2563eb",
    },
    coverA: 0.8,
    rimA: 0.2,
    smooth: 0.5,
  });
  const plan = createSurveyPlan(g, frame, hTex, rect, {
    hTex,
    light,
    albedo: "#a6a8a3",
    line: "#e9eef0",
  });
  const fragOf = (m: { material: unknown }) =>
    (m.material as { fragmentShader: string }).fragmentShader;

  it("is off until it is driven: both shaders start with no front", () => {
    expect(relief.uniforms.uScanA.value).toBe(0);
    expect(plan.uniforms.uScanA.value).toBe(0);
  });

  it("touches a pixel only inside its own guard, so the default render is the render without it", () => {
    for (const src of [fragOf(relief.mesh), fragOf(plan.mesh)]) {
      const guard = src.indexOf("if (uScanA > 0.001) {");
      expect(guard).toBeGreaterThan(0);
      // the guarded block runs to the closing brace at its own indent
      const end = src.indexOf("\n  }\n", guard);
      const uses = [...src.matchAll(/uScanH/g)].map((m) => m.index);
      const declaration = src.indexOf("uniform float uScanA, uScanH;");
      for (const at of uses) {
        if (at >= declaration && at < declaration + 40) continue;
        expect(at).toBeGreaterThan(guard);
        expect(at).toBeLessThan(end);
      }
    }
  });
});
