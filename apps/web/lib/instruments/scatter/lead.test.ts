import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { format } from "../../copy/en";
import { windowWords } from "../../land/season";
import { scatterFrom } from "./data";
import { RAIN_LEAD, rainLink } from "./lead";

// The headline of Rain and Greenness from each place's own fit (the restrend bundle's two files).

const BUNDLES = join(import.meta.dirname, "..", "..", "..", "..", "..", "data", "bundles");
const scatterOf = (place: string) => {
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(join(BUNDLES, `bundle_restrend_long_record_${place}`, name), "utf8"));
  return scatterFrom(read("restrend-long-record-tables.json"), read("restrend-long-record.json"));
};
const leadOf = (place: string) => {
  const d = scatterOf(place);
  return format(RAIN_LEAD[rainLink(d.fit)], {
    growing: windowWords(d.windows.growing) ?? "",
    rainfall: windowWords(d.windows.rainfall) ?? "",
  });
};

describe("rainLink", () => {
  it("reads a slope interval wholly above zero as rising, wholly below as falling, else weak", () => {
    expect(rainLink({ lower: 0.00001, upper: 0.0002 })).toBe("rises");
    expect(rainLink({ lower: -0.0002, upper: -0.00001 })).toBe("falls");
    expect(rainLink({ lower: -0.00002, upper: 0.00005 })).toBe("weak");
    expect(rainLink({ lower: 0, upper: 0.0001 })).toBe("weak");
  });

  it("says the first place's greenness follows its rainfall only weakly: the interval holds zero (R squared 0.037)", () => {
    expect(leadOf("ait_bouguemez")).toBe(
      "Year to year, March to June greenness follows September to May rainfall only weakly.",
    );
  });

  it("says Calaveras Creek's greenness rises with its rainfall: the interval lies above zero", () => {
    expect(scatterOf("calaveras_creek").fit.interval_above_zero).toBe(true);
    expect(leadOf("calaveras_creek")).toBe(
      "Year to year, February to May greenness rises with October to April rainfall.",
    );
  });
});
