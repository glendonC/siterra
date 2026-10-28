import { describe, expect, it } from "vitest";
import { checkBudget, countWords, unionArea, type BudgetItem } from "./measure";

const vp = { width: 1000, height: 500 };
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const item = (role: BudgetItem["role"], text = "", rect = box(0, 0, 0, 0)): BudgetItem => ({
  role,
  text,
  rect,
});

describe("countWords", () => {
  it("counts words with letters or digits only", () => {
    expect(countWords("/ Is grazing changing the shared pastures?")).toBe(6);
    expect(countWords("Valley catchment: 417.0 km²")).toBe(4);
    expect(countWords("↵ Start investigation")).toBe(2);
    expect(countWords("   ")).toBe(0);
  });
});

describe("unionArea", () => {
  it("counts overlap once", () => {
    expect(unionArea([box(0, 0, 100, 100), box(50, 50, 100, 100)], vp)).toBe(17500);
  });

  it("clips to the viewport", () => {
    expect(unionArea([box(-50, -50, 100, 100)], vp)).toBe(2500);
  });

  it("adds separate boxes", () => {
    expect(unionArea([box(0, 0, 10, 10), box(100, 100, 10, 10)], vp)).toBe(200);
  });

  it("handles a box nested in another", () => {
    expect(unionArea([box(0, 0, 100, 100), box(10, 10, 10, 10)], vp)).toBe(10000);
  });
});

describe("checkBudget", () => {
  it("passes an arrival with one action, short land labels and open map", () => {
    const r = checkBudget(
      [
        item("action", "Start investigation", box(40, 450, 150, 30)),
        item("command", "Is grazing changing the shared pastures?", box(300, 450, 400, 30)),
        item("land-label", "Tabant"),
        item("land-label", "Outlet: the whole catchment drains here"),
      ],
      vp,
      "arrival",
    );
    expect(r.violations).toEqual([]);
    expect(r.openMapShare).toBeCloseTo(1 - (150 * 30 + 400 * 30) / (1000 * 500), 9);
  });

  it("names each overrun", () => {
    const r = checkBudget(
      [
        item("card", Array.from({ length: 46 }, () => "word").join(" "), box(600, 0, 400, 500)),
        item("card", "second"),
        item("leader"),
        item("leader"),
        item("land-label", "Rain per cell in the 2022/23 wet season"),
      ],
      vp,
      "working",
    );
    expect(r.violations).toEqual([
      "2 cards (at most 1)",
      "2 leaders (at most 1)",
      "land label line of 8 words (at most 6): Rain per cell in the 2022/23 wet season",
      "card of 47 words (at most 45)",
    ]);
    // the card covers 40% of the viewport: 60% open is exactly the working minimum, so it passes
    expect(r.openMapShare).toBeCloseTo(0.6, 9);
  });

  it("counts a two-line block once and exempts its honesty line from the word cap", () => {
    const block: BudgetItem = {
      ...item(
        "land-label",
        "Valley catchment: 417.0 km² Not a pasture, agdal, or management boundary.",
      ),
      lines: [
        { text: "Valley catchment: 417.0 km²", honesty: false },
        { text: "Not a pasture, agdal, or management boundary.", honesty: true },
      ],
    };
    const r = checkBudget([block], vp, "arrival");
    expect(r.counts.landLabels).toBe(1);
    expect(r.violations).toEqual([]);
  });

  it("still caps a long line that is not an honesty line", () => {
    const block: BudgetItem = {
      ...item("land-label", "x"),
      lines: [{ text: "Not a pasture, agdal, or management boundary.", honesty: false }],
    };
    expect(checkBudget([block], vp, "arrival").violations).toEqual([
      "land label line of 7 words (at most 6): Not a pasture, agdal, or management boundary.",
    ]);
  });

  it("fails the open map share below the state minimum", () => {
    const r = checkBudget([item("island", "", box(0, 0, 1000, 200))], vp, "arrival");
    expect(r.violations).toEqual(["open map 60.0% (at least 75% in arrival)"]);
  });
});
