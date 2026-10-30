import { describe, expect, it } from "vitest";
import { seed } from "../seed-listing";
import { placesFrom } from "./context";

// A named place shows only with the credit its source requires.

describe("placesFrom", () => {
  it("refuses a settlement without attribution or licence", () => {
    const strip = (field: "attribution" | "license") => ({
      ...seed,
      records: {
        ...seed.records,
        contextFeatureRecords: (seed.records.contextFeatureRecords ?? []).map((f) =>
          f.id === "ctx_tabant" ? { ...f, [field]: null } : f,
        ),
      },
    });
    expect(placesFrom(seed, ["ctx_tabant"]).map((p) => p.attribution)).toEqual([
      "GeoNames, CC BY 4.0",
    ]);
    expect(() => placesFrom(strip("attribution"), ["ctx_tabant"])).toThrow();
    expect(() => placesFrom(strip("license"), ["ctx_tabant"])).toThrow();
  });
});
