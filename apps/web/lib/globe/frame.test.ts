import { describe, expect, it } from "vitest";
import { globeCamera, localFrame, project, R_KM, unit } from "./frame";

const close = (a: number[], b: number[], digits = 9) => {
  a.forEach((v, i) => {
    expect(v).toBeCloseTo(b[i] ?? NaN, digits);
  });
};

describe("unit and localFrame", () => {
  it("puts lon 0, lat 0 on the x axis with east along y and north along z", () => {
    close(unit(0, 0), [1, 0, 0]);
    const f = localFrame(0, 0);
    close(f.east, [0, 1, 0]);
    close(f.north, [0, 0, 1]);
  });
});

describe("globeCamera", () => {
  const cam = globeCamera(
    { lon: -6.37, lat: 31.66, bearing: 133, pitch: 36, distance: 73.3887, fov: 22 },
    16 / 9,
  );

  it("stands the eye at the given distance from the target", () => {
    const d = Math.hypot(
      cam.eye[0] - cam.target[0],
      cam.eye[1] - cam.target[1],
      cam.eye[2] - cam.target[2],
    );
    expect(d * R_KM).toBeCloseTo(73.3887, 6);
  });

  it("keeps the camera basis orthonormal", () => {
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
    expect(dot(cam.right, cam.upv)).toBeCloseTo(0, 9);
    expect(dot(cam.right, cam.back)).toBeCloseTo(0, 9);
    expect(dot(cam.upv, cam.upv)).toBeCloseTo(1, 9);
  });

  it("projects the target to the centre of the frame", () => {
    const p = project(cam.vp, cam.target, 1440, 810);
    if (!p) throw new Error("target behind the camera");
    // the matrix is float32, as WebGL takes it: a few thousandths of a pixel off at this distance
    expect(p[0]).toBeCloseTo(720, 1);
    expect(p[1]).toBeCloseTo(405, 1);
  });

  it("returns nothing for a point behind the eye", () => {
    const behind: [number, number, number] = [
      cam.eye[0] + cam.back[0],
      cam.eye[1] + cam.back[1],
      cam.eye[2] + cam.back[2],
    ];
    expect(project(cam.vp, behind, 1440, 810)).toBeUndefined();
  });
});
