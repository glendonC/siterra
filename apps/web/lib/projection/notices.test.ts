import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { dataCredits } from "./notices";

const snapshot = CaseSnapshot.parse(seed);

describe("dataCredits", () => {
  const credits = dataCredits(snapshot);

  it("lists each credit the bundles carry once", () => {
    expect(new Set(credits).size).toBe(credits.length);
    expect(credits.length).toBeGreaterThan(2);
  });

  it("keeps the record's wording for the rainfall and Sentinel-2 credits", () => {
    expect(credits).toContain(
      "CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara, https://doi.org/10.15780/G2JQ0P, accessed 2026-10-27",
    );
    expect(credits).toContain("Contains modified Copernicus Sentinel data 2019-2025");
  });

  it("keeps a licence notice whole: no credit starts in lower case", () => {
    expect(credits.filter((c) => /^[a-z]/.test(c))).toEqual([]);
    expect(
      credits.some((c) =>
        c.endsWith("provided under COPERNICUS by the European Union and ESA; all rights reserved"),
      ),
    ).toBe(true);
  });

  it("is empty for a case without bundles", () => {
    expect(
      dataCredits({ ...snapshot, records: { ...snapshot.records, dataBundleRecords: [] } }),
    ).toEqual([]);
  });
});
