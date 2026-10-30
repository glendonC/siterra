import { describe, expect, it } from "vitest";
import { seed } from "../instruments/seed-listing";
import { bandLimitsOf } from "./record";

describe("bandLimitsOf", () => {
  it("reads the two band limits from the record's measurements, lowest first", () => {
    expect(bandLimitsOf(seed)).toEqual([2316.8, 2815.2]);
  });

  it("holds none when the record holds other than two", () => {
    const one = {
      ...seed,
      records: {
        ...seed.records,
        measurementRecords: seed.records.measurementRecords.filter(
          (m) => m.id !== "meas_transect_band_limit_upper_2021",
        ),
      },
    };
    expect(bandLimitsOf(one)).toBeNull();
  });
});
