import { describe, expect, it } from "vitest";
import { mapBoxPoint, mercatorX, mercatorY, projectAt, quadMatrix3d } from "./project";

describe("mercator", () => {
  it("puts lon 0, lat 0 at the middle of the world", () => {
    expect(mercatorX(0)).toBe(0.5);
    expect(mercatorY(0)).toBeCloseTo(0.5, 12);
  });
});

describe("projectAt", () => {
  it("projects through an orthographic matrix that maps the world square to clip space", () => {
    // x, y in world pixels of a 512 px world to clip -1..1, y down; z ignored
    const s = 2 / 512;
    const mvp = [s, 0, 0, 0, 0, -s, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1];
    const p = projectAt(mvp, 512, 0, 0, 1000, 800, 600);
    expect(p?.x).toBeCloseTo(400, 6);
    expect(p?.y).toBeCloseTo(300, 6);
  });

  it("returns nothing behind the camera", () => {
    const mvp = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1];
    expect(projectAt(mvp, 512, 0, 0, 0, 800, 600)).toBeUndefined();
  });
});

describe("quadMatrix3d", () => {
  const tl = { x: 100, y: 120 };
  const tr = { x: 900, y: 80 };
  const br = { x: 950, y: 400 };
  const bl = { x: 60, y: 380 };

  it("sends the box's corners to the quad's corners", () => {
    const at = (x: number, y: number) => mapBoxPoint(400, 100, tl, tr, br, bl, x, y);
    for (const [p, q] of [
      [at(0, 0), tl],
      [at(400, 0), tr],
      [at(400, 100), br],
      [at(0, 100), bl],
    ] as const) {
      expect(p.x).toBeCloseTo(q.x, 3);
      expect(p.y).toBeCloseTo(q.y, 3);
    }
  });

  it("writes a CSS matrix3d", () => {
    expect(quadMatrix3d(400, 100, tl, tr, br, bl)).toMatch(/^matrix3d\((-?[\d.]+,){15}-?[\d.]+\)$/);
  });
});
