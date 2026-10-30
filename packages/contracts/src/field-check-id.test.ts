import { describe, expect, it } from "vitest";
import { FieldMeasurement, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const base = {
  what: "Who sets rest dates",
  method: "Interviews with institution roles",
  season: "Spring",
  stratumKeys: ["elevation_high"],
  fieldRole: "Local field team",
  resolvesGapIds: [],
  discriminatesHypothesisIds: [],
};
const ok = (value: unknown) => FieldMeasurement.safeParse(value).success;

describe("contracts 1.19: the field check a field measurement serves", () => {
  it("accepts 1.19.0 and every earlier version of the same MAJOR", () => {
    expect(caseSchemaVersion).toBe("1.19.0");
    for (const version of [caseSchemaVersion, "1.2.0", "1.17.0", "1.18.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(version);
    }
  });

  it("keeps a measurement without a field check valid and accepts one with a field check id", () => {
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, fieldCheckId: "herd_records" })).toBe(true);
  });

  it("refuses a field check id that is not a lower case key, or an empty or null one", () => {
    for (const fieldCheckId of ["Herd Records", "", "1herd", null, 7]) {
      expect(ok({ ...base, fieldCheckId }), String(fieldCheckId)).toBe(false);
    }
  });
});
