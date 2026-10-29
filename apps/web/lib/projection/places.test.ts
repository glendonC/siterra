import { CaseSnapshot, type ContextFeature } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import example from "../../../../schemas/examples/case-snapshot.json";
import seedFile from "../../../../data/case/context-features.json";
import { contextLand } from "./places";

const base = CaseSnapshot.parse(example);

/** The seed's context features as the case-seed loader writes them. */
const seedFeatures: ContextFeature[] = seedFile.features.map((f) => ({
  recordType: "ContextFeature",
  id: f.id,
  revision: 1,
  createdAt: "2026-10-27T00:00:00Z",
  updatedAt: "2026-10-27T00:00:00Z",
  caseId: seedFile.caseId,
  name: f.name,
  role: f.role as ContextFeature["role"],
  geometry: { type: "Point", coordinates: [f.lonLat[0] ?? 0, f.lonLat[1] ?? 0] },
  crs: "EPSG:4326",
  method: f.method,
  datasetId: f.datasetId,
  sourceIds: f.sourceIds,
  attribution: f.attribution,
  license: f.license,
  limitations: f.limitations,
}));

function withFeatures(features: ContextFeature[] | undefined): CaseSnapshot {
  return { ...base, records: { ...base.records, contextFeatureRecords: features } };
}

describe("contextLand", () => {
  it("places the villages and the outlet where their records put them", () => {
    const land = contextLand(withFeatures(seedFeatures));
    expect(land.places).toEqual([
      { id: "ctx_tabant", name: "Tabant", lon: -6.42007, lat: 31.65873 },
      { id: "ctx_ait_ouchi_locator", name: "Aït Ouchi", lon: -6.338611, lat: 31.703611 },
    ]);
    expect(land.outlet).toEqual({
      id: "ctx_catchment_outlet",
      name: "Catchment outlet",
      lon: -6.5372222,
      lat: 31.6377778,
    });
  });

  it("credits each point for exactly its own source, in the record's words", () => {
    const land = contextLand(withFeatures(seedFeatures));
    expect(land.credits.map((c) => [c.name, c.attribution])).toEqual([
      ["Catchment outlet", seedFeatures[0]?.attribution],
      ["Tabant", "GeoNames, CC BY 4.0"],
      ["Aït Ouchi", "Aakairi, M. et al. (2026), People and Nature, CC BY 4.0"],
    ]);
    expect(land.creditLine).toBe("© OpenStreetMap contributors.");
  });

  it("lists the outlet first, then the places west to east, whatever order the records come in", () => {
    const shuffled = [...seedFeatures].reverse();
    const land = contextLand(withFeatures(shuffled));
    expect(land.places.map((p) => p.name)).toEqual(["Tabant", "Aït Ouchi"]);
    expect(land.credits.map((c) => c.name)).toEqual(["Catchment outlet", "Tabant", "Aït Ouchi"]);
  });

  it("shows no point and no place credit when the case has no context features", () => {
    const land = contextLand(withFeatures(undefined));
    expect(land).toEqual({ places: [], outlet: undefined, credits: [], creditLine: "" });
  });

  it("names OpenStreetMap only when a shown point's record uses it", () => {
    const noOsm = seedFeatures.filter((f) => f.role !== "outlet");
    expect(contextLand(withFeatures(noOsm)).creditLine).not.toContain("OpenStreetMap");
  });
});
