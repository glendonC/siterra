import { describe, expect, it } from "vitest";
import { en } from "../copy/en";
import { seed } from "../instruments/seed-listing";
import { buildOverviewSourceSet } from "./credits";

describe("buildOverviewSourceSet", () => {
  it("returns the static bundled datasets for a non-ingested case", () => {
    const out = buildOverviewSourceSet(seed, null, null);
    expect(out.short).toEqual([
      en["source.modis"].text,
      en["source.chirps"].text,
      en["source.worldcover"].text,
      en["source.dem"].text,
    ]);
    expect(out.lines).toEqual([
      en["instrument.credit.modisNdvi"].text,
      en["instrument.credit.chirps"].text,
      en["instrument.credit.worldcover"].text,
      en["instrument.credit.dem"].text,
    ]);
  });

  it("names a live place's actual elevation source and datasets without claiming Copernicus DEM or MODIS when absent", () => {
    const baseB = seed.records.dataBundleRecords[0];
    if (!baseB) throw new Error("missing seed bundle");
    const liveSnapshot = {
      ...seed,
      case: { ...seed.case, id: "case_loc_queenstown_7e0699" },
      records: {
        ...seed.records,
        dataBundleRecords: [
          {
            ...baseB,
            id: "bundle_1",
            caseId: "case_loc_queenstown_7e0699",
            caseRevision: 2,
            datasetId: "aws_terrarium_dem",
            label: "Terrain relief (AWS Terrarium z12)",
            version: "2024",
            license: "Public domain / open sources",
            attribution: "Terrain Tiles (Mapzen / AWS Open Data) at zoom 12",
            spatialResolution: "38 m",
            temporalCoverage: "Static",
            status: "validated" as const,
            notes: null,
          },
          {
            ...baseB,
            id: "bundle_2",
            caseId: "case_loc_queenstown_7e0699",
            caseRevision: 2,
            datasetId: "esa_worldcover_2021",
            label: "ESA WorldCover 10 m 2021 v200",
            version: "v200",
            license: "CC BY 4.0",
            attribution: "ESA WorldCover 10 m 2021 v200 (CC BY 4.0)",
            spatialResolution: "10 m",
            temporalCoverage: "2021",
            status: "validated" as const,
            notes: null,
          },
          {
            ...baseB,
            id: "bundle_3",
            caseId: "case_loc_queenstown_7e0699",
            caseRevision: 2,
            datasetId: "open_meteo_era5",
            label: "ERA5 historical climate (Open-Meteo)",
            version: "2024",
            license: "CC BY 4.0",
            attribution: "Copernicus Climate Change Service ERA5 via Open-Meteo",
            spatialResolution: "9 km",
            temporalCoverage: "2000 to 2024",
            status: "validated" as const,
            notes: null,
          },
        ],
        sourceRecords: [],
      },
    };
    const out = buildOverviewSourceSet(liveSnapshot, null, null, {
      kind: "terrarium_z12",
      despikedPixels: 14,
    });
    expect(out.short).toContain("AWS Terrarium z12");
    expect(out.short).toContain("ESA WorldCover 10 m 2021");
    expect(out.short).toContain("ERA5 / Open-Meteo");
    expect(out.short).not.toContain("Copernicus DEM GLO-30");
    expect(out.short).not.toContain(en["source.modis"].text);
    expect(out.short).not.toContain(en["source.chirps"].text);
    expect(out.lines.some((l) => l.includes("14 despiked pixels"))).toBe(true);

    const demoCopySnapshot = {
      ...liveSnapshot,
      case: { ...liveSnapshot.case, id: "case_demo_999" },
      records: {
        ...liveSnapshot.records,
        dataBundleRecords: liveSnapshot.records.dataBundleRecords.map((b, i) => ({
          ...b,
          id: `bundle_loc_${String(i)}`,
        })),
      },
    };
    const demoOut = buildOverviewSourceSet(demoCopySnapshot, null, null, null);
    expect(demoOut.short).not.toContain(en["source.modis"].text);
    expect(demoOut.short).toContain("ERA5 / Open-Meteo");
  });
});
