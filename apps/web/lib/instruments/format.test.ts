import { describe, expect, it } from "vitest";
import { metres, percent, signed } from "./format";

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
});
