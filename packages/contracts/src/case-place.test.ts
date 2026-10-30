import { describe, expect, it } from "vitest";
import { EnvironmentalCase, acceptedCaseSchemaVersions, caseSchemaVersion } from "./case.ts";

const base = {
  recordType: "EnvironmentalCase",
  id: "case_example_place",
  revision: 1,
  createdAt: "2026-10-30T12:00:00Z",
  updatedAt: "2026-10-30T12:00:00Z",
  title: "Example case",
  objective: "Is the example changing?",
  status: "commissioned",
  mode: "concept",
  ownerScopeId: "seed",
  activeGeoSelectionId: null,
  currentBriefId: null,
  unresolvedQuestions: [],
  permissionProfile: "research_and_preparation_only",
  description: "Synthetic test record.",
};
const ok = (value: unknown) => EnvironmentalCase.safeParse(value).success;

describe("contracts 1.18: the place a case is about", () => {
  it("accepts 1.18.0 and every earlier version of the same MAJOR", () => {
    expect(acceptedCaseSchemaVersions).toContain("1.18.0");
    expect(acceptedCaseSchemaVersions).toContain(caseSchemaVersion);
    for (const earlier of ["1.2.0", "1.16.0", "1.17.0"]) {
      expect(acceptedCaseSchemaVersions).toContain(earlier);
    }
  });

  it("keeps a case without a place valid and accepts a place with a name and a region", () => {
    expect(ok(base)).toBe(true);
    expect(
      ok({ ...base, place: { name: "Example valley", region: "Example range, Country" } }),
    ).toBe(true);
  });

  it("refuses a place without both words, with an empty word or with another key", () => {
    expect(ok({ ...base, place: { name: "Example valley" } })).toBe(false);
    expect(ok({ ...base, place: { region: "Example range, Country" } })).toBe(false);
    expect(ok({ ...base, place: { name: "", region: "Example range, Country" } })).toBe(false);
    expect(ok({ ...base, place: { name: "Example valley", region: "" } })).toBe(false);
    expect(
      ok({ ...base, place: { name: "Example valley", region: "Example range", extra: 1 } }),
    ).toBe(false);
    expect(ok({ ...base, place: null })).toBe(false);
  });
});
