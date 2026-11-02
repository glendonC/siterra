import { DataTexture, FloatType, RedFormat, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { makeFrame } from "../../instruments/valley/frame";
import { centreOf } from "../data";
import { contourSteps, EXAG, reliefExaggeration } from "./overview";
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

describe("relief exaggeration, cell size and contour intervals", () => {
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
  const colours = {
    albedo: "#a6a8a3",
    line: "#e9eef0",
    treeC: "#5c8f63",
    cropC: "#93b872",
    limitC: [1, 1, 1] as const,
    fogC: "#10181b",
    rimC: "#a9c9d4",
    scanC: "#2563eb",
  };

  it("keeps EXAG 2.5 for Ait Bouguemez and mountain ranges, and raises gentle and flat places up to 6", () => {
    // Ait Bouguemez (~1800 m over ~36 km), Queenstown (~1624 m over ~28 km), Anti-Atlas (~1080 m over ~28 km)
    expect(reliefExaggeration(1800, 36)).toBe(EXAG);
    expect(reliefExaggeration(1624, 28)).toBe(EXAG);
    expect(reliefExaggeration(1080, 28)).toBe(EXAG);
    // New York (~114 m over ~28 km) and Iowa plain (~52 m over ~28 km) read with raised display exaggeration, capped at 6
    const nyExag = reliefExaggeration(114, 28);
    expect(nyExag).toBeGreaterThan(EXAG);
    expect(nyExag).toBeLessThanOrEqual(6);
    expect(reliefExaggeration(52, 28)).toBe(6);
  });

  it("chooses contour and index intervals for the relief range, capped at 250 m and 1000 m", () => {
    expect(contourSteps(1800)).toEqual([250, 1000]);
    expect(contourSteps(1624)).toEqual([250, 1000]);
    expect(contourSteps(1080)).toEqual([250, 1000]);
    expect(contourSteps(114)).toEqual([20, 100]);
    expect(contourSteps(52)).toEqual([10, 50]);
    expect(contourSteps(6)).toEqual([1, 5]);
  });

  it("passes the relief grid's cell size and contour intervals into the relief shader uniforms", () => {
    const bundled = createRelief(new Float32Array(4), g, frame, hTex, rect, {
      hTex,
      light,
      lightMap: hTex,
      colours,
      coverA: 0.8,
      rimA: 0.2,
      smooth: 0.5,
    });
    expect(bundled.uniforms).toHaveProperty("uCell.value", 30);
    expect([bundled.uniforms.uStep.value.x, bundled.uniforms.uStep.value.y]).toEqual([250, 1000]);

    const live = createRelief(new Float32Array(4), g, frame, hTex, rect, {
      hTex,
      light,
      lightMap: hTex,
      cellM: 82.5,
      contourStep: [10, 50],
      colours,
      coverA: 0.8,
      rimA: 0.2,
      smooth: 0.5,
    });
    expect(live.uniforms).toHaveProperty("uCell.value", 82.5);
    expect([live.uniforms.uStep.value.x, live.uniforms.uStep.value.y]).toEqual([10, 50]);
    expect(live.uniforms).toHaveProperty("uPhotoA.value", 0);

    const photoTex = new DataTexture(new Uint8Array([40, 80, 50, 255]), 1, 1);
    const draped = createRelief(new Float32Array(4), g, frame, hTex, rect, {
      hTex,
      light,
      lightMap: hTex,
      trueColour: photoTex,
      colours,
      coverA: 0.8,
      rimA: 0.2,
      smooth: 0.5,
    });
    expect(draped.uniforms).toHaveProperty("uPhoto.value", photoTex);
    expect(draped.uniforms.uPhotoA.value).toBeGreaterThan(0);
  });
});
