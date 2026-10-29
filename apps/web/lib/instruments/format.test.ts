import { describe, expect, it } from "vitest";
import { change, day, fixed, metres, percent, signed } from "./format";

describe("instrument number forms", () => {
  it("signs a figure with a true minus sign and fixed decimals", () => {
    expect(signed(0.00906, 4)).toBe("+0.0091");
    expect(signed(-0.05, 2)).toBe("−0.05");
  });

  it("writes a share as a per cent with one decimal", () => {
    expect(percent(0.247)).toBe("24.7%");
    expect(percent(1, 0)).toBe("100%");
  });

  it("rounds metres to whole numbers with a thousands separator", () => {
    expect(metres(2316.8)).toBe("2,317");
    expect(metres(2815.2)).toBe("2,815");
  });

  it("writes a plain figure with a true minus sign and no plus", () => {
    expect(fixed(0.4766, 2)).toBe("0.48");
    expect(fixed(-0.051, 2)).toBe("−0.05");
    expect(fixed(-0.001, 2)).toBe("0.00");
  });

  it("signs a change, except one that rounds to zero", () => {
    expect(change(0.1261, 2)).toBe("+0.13");
    expect(change(-0.002, 2)).toBe("0.00");
  });

  it("writes a date as day, short month and year", () => {
    expect(day("2025-06-11T11:12:25.006000Z")).toBe("11 Jun 2025");
    expect(day("2025-07-26")).toBe("26 Jul 2025");
  });
});
