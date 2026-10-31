import { describe, expect, it } from "vitest";
import { periodOf, windowWords } from "./season";

describe("a place's seasons in words (U25)", () => {
  it("reads each place's own window ids", () => {
    expect(windowWords("mar_jun")).toBe("March to June");
    expect(windowWords("sep_may")).toBe("September to May");
    expect(windowWords("feb_may")).toBe("February to May");
    expect(windowWords("oct_apr")).toBe("October to April");
  });

  it("says nothing for an id that does not name two months", () => {
    expect(windowWords("summer")).toBeNull();
    expect(windowWords("mar_jun_x")).toBeNull();
    expect(windowWords(null)).toBeNull();
  });

  it("reads a period id's years and window", () => {
    expect(periodOf("period_2000-2025_feb_may")).toEqual({
      from: 2000,
      to: 2025,
      window: "feb_may",
    });
    expect(periodOf("period_2000-2025_mar_jun")).toEqual({
      from: 2000,
      to: 2025,
      window: "mar_jun",
    });
    expect(periodOf("period_2021")).toEqual({ from: 2021, to: 2021, window: null });
    expect(periodOf("period_2001_sep_may")).toEqual({ from: 2001, to: 2001, window: "sep_may" });
    expect(periodOf("elsewhere")).toBeNull();
  });
});
