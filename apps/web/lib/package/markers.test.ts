import { describe, expect, it } from "vitest";
import { groupByAnchor, labelWidth, layoutMarkers, STEM, type MarkerPoint } from "./markers";

const at = (x: number, y: number): MarkerPoint => ({ x, y, behind: false });
const overlap = (
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe("field check markers (package 1f)", () => {
  it("stands checks that share an anchor as one marker carrying their numbers", () => {
    // "Founder instance smoke 4": six checks on one band's place, one off the land
    const pts = [at(700, 450), at(700, 450), null, at(702, 451), at(700, 450), at(700, 450)];
    const groups = groupByAnchor(pts);
    expect(groups.map((g) => g.members)).toEqual([[0, 1, 3, 4, 5]]);
  });

  it("never lets two labels overlap: a label that would meet another rises a level", () => {
    const pts = [at(600, 500), at(640, 505), at(660, 498), at(900, 300), at(610, 520)];
    const width = (m: readonly number[]) =>
      labelWidth(m.length, m.includes(1) ? "A long check name that runs on" : null);
    const out = layoutMarkers(pts, width);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (a && b) expect(overlap(a.box, b.box), `${String(i)} and ${String(j)}`).toBe(false);
      }
    expect(out.some((g) => g.stem > STEM)).toBe(true);
  });

  it("names an open check in full, numbers only otherwise", () => {
    expect(labelWidth(3, null)).toBeLessThan(70);
    expect(
      labelWidth(1, "Decision roles for shared pasture opening dates and access rules"),
    ).toBeGreaterThan(400);
  });
});
