import { describe, expect, it } from "vitest";
import { seed, seedListing } from "../instruments/seed-listing";
import { FINDINGS, findingsFrom } from "./findings";

// The findings' numbers are the Measurements the instrument specs cite, formatted as the instruments format them.
describe("findingsFrom (seed case)", () => {
  const { findings, bandLimit } = findingsFrom(seed, seedListing);
  const byId = Object.fromEntries(findings.map((f) => [f.id, f]));

  it("shows all five findings at D4's clock angles", () => {
    expect(findings.map((f) => [f.id, f.clock, f.tone])).toEqual([
      ["catchment", 306, "green"],
      ["band", 32, "green"],
      ["pixel", 52, "green"],
      ["rain", 112, "blue"],
      ["fdr", 280, "green"],
    ]);
  });

  it("takes each value from the Measurement its spec's caption cites", () => {
    for (const f of findings) {
      const plan = FINDINGS.find((p) => p.id === f.id);
      const spec = seed.records.instrumentSpecRecords?.find(
        (s) => s.parameters.kind === plan?.kind,
      );
      const id = spec?.caption.citationIds[plan?.citation ?? -1];
      const m = seed.records.measurementRecords.find((x) => x.id === id);
      expect(f.measurementId).toBe(id);
      expect(f.value).toBe(m?.value);
    }
  });

  it("formats trends signed to 4 decimals, R squared to 3, the share as a per cent", () => {
    expect(byId.catchment?.display).toBe("+0.0091");
    expect(byId.band?.display).toBe("+0.0134");
    expect(byId.pixel?.display).toBe("+0.0570");
    expect(byId.rain?.display).toBe("0.037");
    expect(byId.fdr?.display).toBe("24.7%");
  });

  it("takes the band limit from the cross section's elevation band limit", () => {
    expect(bandLimit).toEqual({ value: 2316.8, display: "2,317" });
  });

  it("leaves out a finding whose spec the case does not hold", () => {
    const listing = {
      ...seedListing,
      instruments: seedListing.instruments.filter((v) => v.spec.parameters.kind !== "layer_stack"),
    };
    expect(findingsFrom(seed, listing).findings.map((f) => f.id)).toEqual([
      "band",
      "pixel",
      "rain",
    ]);
  });

  it("names the share's direction from its Measurement's metric: upward greening, downward browning", () => {
    expect(byId.fdr?.direction).toBe("up");
    const at = (metric: string) => {
      const records = {
        ...seed.records,
        measurementRecords: seed.records.measurementRecords.map((m) =>
          m.id === byId.fdr?.measurementId ? { ...m, metric } : m,
        ),
      };
      return findingsFrom({ ...seed, records }, seedListing).findings.find((f) => f.id === "fdr")
        ?.direction;
    };
    expect(at("area_share_downward_fdr")).toBe("down");
    expect(at("area_share_fdr")).toBeNull();
    // a trend has no share direction
    expect(byId.catchment?.direction).toBeNull();
  });

  it("leaves out a finding whose Measurement has no value", () => {
    const records = {
      ...seed.records,
      measurementRecords: seed.records.measurementRecords.map((m) =>
        m.id === byId.rain?.measurementId ? { ...m, value: null, status: "missing" as const } : m,
      ),
    };
    const ids = findingsFrom({ ...seed, records }, seedListing).findings.map((f) => f.id);
    expect(ids).not.toContain("rain");
  });
});
