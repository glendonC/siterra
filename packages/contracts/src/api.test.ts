import { describe, expect, it } from "vitest";
import { InstrumentAsset, InstrumentListing } from "./api.ts";

const available = {
  bundleId: "bundle_example_restrend",
  assetKey: "restrend_tables",
  status: "available",
  href: "/api/case-assets/bundle_example_restrend/1220abcd/restrend-long-record-tables.json",
  contentType: "application/json",
  checksum: "1220abcd",
  size: 1024,
};
const missing = {
  bundleId: "bundle_example_restrend",
  assetKey: "restrend_tables",
  status: "asset_key_unknown",
  href: null,
  contentType: null,
  checksum: null,
  size: null,
};

const problems = (value: unknown) =>
  (InstrumentAsset.safeParse(value).error?.issues ?? []).map((i) => i.path.join("/"));

describe("GET /api/cases/:id/instruments: an asset is available with everything, or missing with nothing", () => {
  it("accepts an available asset that names its URL, type, checksum and size", () => {
    expect(problems(available)).toEqual([]);
  });

  it.each(["bundle_not_in_case", "bundle_not_validated", "asset_key_unknown", "file_unavailable"])(
    "accepts a %s asset with none of them",
    (status) => {
      expect(problems({ ...missing, status })).toEqual([]);
    },
  );

  it("refuses an available asset that lacks any of the four", () => {
    for (const field of ["href", "contentType", "checksum", "size"]) {
      expect(problems({ ...available, [field]: null }), field).toContain(field);
    }
  });

  it("refuses an asset that is not available yet names a file", () => {
    expect(problems({ ...missing, href: available.href })).toContain("href");
    expect(problems({ ...missing, checksum: "1220abcd" })).toContain("checksum");
  });

  it("refuses a status outside the five, and a key of another shape", () => {
    expect(problems({ ...missing, status: "ok" })).toContain("status");
    expect(problems({ ...missing, assetKey: "Restrend Tables" })).toContain("assetKey");
  });

  it("a listing with no instruments parses, and names its case and revision", () => {
    expect(
      InstrumentListing.safeParse({
        caseId: "case_example_atlas",
        caseRevision: 3,
        instruments: [],
      }).success,
    ).toBe(true);
    expect(
      InstrumentListing.safeParse({
        caseId: "case_example_atlas",
        caseRevision: 0,
        instruments: [],
      }).success,
    ).toBe(false);
  });
});

describe("InstrumentListing: the rules the composer could not open", () => {
  const base = { caseId: "case_example_atlas", caseRevision: 3, instruments: [] };
  const blocked = {
    ruleId: "field_plan_valley",
    kind: "field_plan",
    reasons: ["The case holds no branch merge with a field plan"],
  };

  it("carries blocked rules with the composer's reasons, and rules it did not open", () => {
    expect(
      InstrumentListing.safeParse({ ...base, blocked: [blocked], notOpened: ["rule_other"] })
        .success,
    ).toBe(true);
    expect(InstrumentListing.safeParse({ ...base, blocked: [], notOpened: [] }).success).toBe(true);
    expect(InstrumentListing.safeParse(base).success).toBe(true);
  });

  it("refuses a blocked rule with no reason, an unknown kind or another key", () => {
    expect(
      InstrumentListing.safeParse({ ...base, blocked: [{ ...blocked, reasons: [] }] }).success,
    ).toBe(false);
    expect(
      InstrumentListing.safeParse({ ...base, blocked: [{ ...blocked, kind: "hologram" }] }).success,
    ).toBe(false);
    expect(
      InstrumentListing.safeParse({ ...base, blocked: [{ ...blocked, html: "<b>x</b>" }] }).success,
    ).toBe(false);
  });
});
