import { describe, expect, it } from "vitest";
import type { Snow } from "../instruments/valley/fixtures";
import { snowBandsOf } from "./layers-data";

const band = (label: string, feb: number) => ({
  label,
  monthly_mean: Array.from({ length: 12 }, (_, m) => (m === 1 ? feb : 0)),
  years_used: Array.from({ length: 12 }, () => 25),
});

describe("the snow sheet's bands", () => {
  it("reads the fixed 500 m bands low to high with their share in the month, and nothing else", () => {
    const snow: Snow = {
      months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      bands: {
        catchment: band("catchment", 0.5),
        elev_3500_up: band("3500 m and above", 0.9),
        elev_below_2000: band("below 2000 m", 0.1),
        elev_2000_2500: band("2000 to 2500 m", 0.3),
        elevation_low: band("low", 0.2),
      },
    };
    expect(snowBandsOf(snow, 1)).toEqual([
      { lo: null, hi: 2000, share: 0.1 },
      { lo: 2000, hi: 2500, share: 0.3 },
      { lo: 3500, hi: null, share: 0.9 },
    ]);
  });
});
