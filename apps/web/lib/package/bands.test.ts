import { describe, expect, it } from "vitest";
import { rangeOfKey } from "./bands";

const LIMITS: [number, number] = [2316.8, 2815.2];

describe("rangeOfKey", () => {
  it("gives each elevation key its range between the record's two limits", () => {
    expect(rangeOfKey("elevation_low", LIMITS)).toEqual({ lo: null, hi: 2316.8 });
    expect(rangeOfKey("elevation_mid", LIMITS)).toEqual({ lo: 2316.8, hi: 2815.2 });
    expect(rangeOfKey("elevation_high", LIMITS)).toEqual({ lo: 2815.2, hi: null });
  });

  it("names no range for another key or without the record's limits", () => {
    expect(rangeOfKey("aspect_north", LIMITS)).toBeNull();
    expect(rangeOfKey("valley_bottom_fields", LIMITS)).toBeNull();
    expect(rangeOfKey("elevation_high", null)).toBeNull();
  });
});
