import { afterEach, describe, expect, it, vi } from "vitest";
import { Evidence, Source } from "@siterra/contracts";
import { overviewDataFromTerrain, type TerrainFile } from "../overview/terrain.ts";
import { fetchBiodiversityContext } from "./biodiversity-fetcher.ts";
import { fetchRealHydrology } from "./hydrology-fetcher.ts";
import {
  buildSatelliteSourcesAndEvidence,
  encodeRgbaPng,
  fetchSatelliteLandCover,
  latLonToMetaCanopyQuadKey,
} from "./satellite-fetcher.ts";

/** Answers every fetch from `respond`, given the request's URL. */
function mockFetch(respond: (url: string) => Response): void {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(respond(input instanceof Request ? input.url : input.toString())),
  );
}

describe("earth-data live fetchers and 3D terrain adapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches STAC metadata, Meta DINOv2 canopy quadkey, and decodes 64x64 ESA WorldCover crop PNG", async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      if (i < 1024) {
        // Class 10: Tree cover (#006400 -> 0, 100, 0)
        rgba[p] = 0;
        rgba[p + 1] = 100;
        rgba[p + 2] = 0;
        rgba[p + 3] = 255;
      } else if (i < 2048) {
        // Class 40: Cropland (#F096FF -> 240, 150, 255)
        rgba[p] = 240;
        rgba[p + 1] = 150;
        rgba[p + 2] = 255;
        rgba[p + 3] = 255;
      } else if (i < 3072) {
        // Class 30: Grassland (#FFFF4C -> 255, 255, 76)
        rgba[p] = 255;
        rgba[p + 1] = 255;
        rgba[p + 2] = 76;
        rgba[p + 3] = 255;
      } else {
        // Class 80: Water (#0064C8 -> 0, 100, 200)
        rgba[p] = 0;
        rgba[p + 1] = 100;
        rgba[p + 2] = 200;
        rgba[p + 3] = 255;
      }
    }
    const pngBytes = encodeRgbaPng(width, height, rgba);

    mockFetch((url) => {
      if (url.includes("/api/stac/v1/search")) {
        return new Response(
          JSON.stringify({
            features: [
              {
                id: "ESA_WorldCover_10m_2021_v200_N30W009",
                collection: "esa-worldcover",
                properties: {
                  end_datetime: "2021-12-31T23:59:59Z",
                },
                assets: {
                  tilejson: {
                    href: "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?collection=esa-worldcover&item=ESA_WorldCover_10m_2021_v200_N30W009",
                  },
                },
              },
              {
                id: "S2A_MSIL2A_20261031T110121_R094_T29SQR",
                collection: "sentinel-2-l2a",
                properties: {
                  datetime: "2026-10-31T11:01:21Z",
                  "eo:cloud_cover": 7.88,
                  platform: "Sentinel-2A",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/data/v1/item/crop/")) {
        return new Response(Buffer.from(pngBytes), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const bbox: [number, number, number, number] = [-6.55, 31.55, -6.35, 31.75];
    const sat = await fetchSatelliteLandCover(bbox);

    expect(sat.worldCoverItemId).toBe("ESA_WorldCover_10m_2021_v200_N30W009");
    expect(sat.worldCoverYear).toBe(2021);
    expect(sat.sentinel2ItemId).toBe("S2A_MSIL2A_20261031T110121_R094_T29SQR");
    expect(sat.sentinel2CloudCover).toBe(7.88);
    expect(sat.sentinel2Platform).toBe("Sentinel-2A");
    expect(sat.metaCanopyQuadKey).toBe(latLonToMetaCanopyQuadKey(31.65, -6.45, 9));
    expect(sat.metaCanopyTileUrl).toContain("dataforgood-fb-data.s3.amazonaws.com");

    expect(sat.treeCoverPct).toBe(25);
    expect(sat.croplandPct).toBe(25);
    expect(sat.grasslandPct).toBe(25);
    expect(sat.waterPct).toBe(25);
    expect(sat.barePct).toBe(0);
    expect(sat.landCoverGrid?.width).toBe(64);
    expect(sat.landCoverGrid?.height).toBe(64);
    expect(sat.landCoverGrid?.tree[0]).toBe(255);
    expect(sat.landCoverGrid?.crop[1024]).toBe(255);

    const built = buildSatelliteSourcesAndEvidence({
      caseId: "case_loc_test_123456",
      slug: "test",
      hash6: "123456",
      placeName: "Aït Bouguemez",
      geoId: "geo_loc_test_123456",
      now: "2026-11-01T12:00:00.000Z",
      satellite: sat,
    });
    // WorldCover and Sentinel-2; no canopy record, since the canopy tile is named but never read
    expect(built.sources.length).toBe(2);
    expect(built.evidence.length).toBe(2);
    expect(built.sources.some((x) => x.id.includes("meta_chm"))).toBe(false);
    for (const s of built.sources) {
      expect(() => Source.parse(s)).not.toThrow();
    }
    for (const e of built.evidence) {
      expect(() => Evidence.parse(e)).not.toThrow();
    }
  });

  it("gracefully falls back when WorldCover crop endpoint fails", async () => {
    mockFetch((url) => {
      if (url.includes("/api/stac/v1/search")) {
        return new Response(
          JSON.stringify({
            features: [
              {
                id: "ESA_WorldCover_10m_2021_v200_N30W009",
                collection: "esa-worldcover",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("Gateway Timeout", { status: 504 });
    });

    const sat = await fetchSatelliteLandCover([-6.55, 31.55, -6.35, 31.75]);
    expect(sat.worldCoverItemId).toBe("ESA_WorldCover_10m_2021_v200_N30W009");
    expect(sat.landCoverGrid).toBeUndefined();
  });

  it("fetches Overpass waterways, peaks, and protected areas", async () => {
    mockFetch(() => {
      return new Response(
        JSON.stringify({
          elements: [
            {
              type: "way",
              id: 1,
              tags: { waterway: "river", name: "Assif n'Aït Bouguemez" },
              geometry: [
                { lat: 31.61, lon: -6.49 },
                { lat: 31.63, lon: -6.47 },
                { lat: 31.65, lon: -6.45 },
                { lat: 31.67, lon: -6.43 },
                { lat: 31.69, lon: -6.41 },
              ],
            },
            {
              type: "node",
              id: 2,
              lat: 31.51,
              lon: -6.44,
              tags: { natural: "peak", name: "Ighil M'Goun", ele: "4068 m" },
            },
            {
              type: "way",
              id: 3,
              tags: { boundary: "protected_area", name: "M'Goun UNESCO Global Geopark" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const hydro = await fetchRealHydrology([-6.55, 31.55, -6.35, 31.75]);
    expect(hydro.streamPaths).toHaveLength(1);
    expect(hydro.streamPaths[0]).toEqual([
      [-6.49, 31.61],
      [-6.47, 31.63],
      [-6.45, 31.65],
      [-6.43, 31.67],
      [-6.41, 31.69],
    ]);
    expect(hydro.namedWaterways).toEqual(["Assif n'Aït Bouguemez"]);
    expect(hydro.namedPeaks).toEqual([
      { name: "Ighil M'Goun", elevationM: 4068, lon: -6.44, lat: 31.51 },
    ]);
    expect(hydro.protectedAreas).toEqual(["M'Goun UNESCO Global Geopark"]);
  });

  it("fetches GBIF species occurrences and builds schema-valid Source and Evidence", async () => {
    mockFetch(() => {
      return new Response(
        JSON.stringify({
          count: 142,
          results: [
            {
              key: 901,
              species: "Juniperus thurifera",
              kingdom: "Plantae",
              family: "Cupressaceae",
              iucnRedListCategory: "LC",
              year: 2023,
              decimalLatitude: 31.652,
              decimalLongitude: -6.421,
            },
            {
              key: 902,
              species: "Juniperus thurifera",
              kingdom: "Plantae",
              family: "Cupressaceae",
              iucnRedListCategory: "LC",
              year: 2024,
              decimalLatitude: 31.658,
              decimalLongitude: -6.418,
            },
            {
              key: 903,
              scientificName: "Macaca sylvanus",
              vernacularName: "Barbary macaque",
              kingdom: "Animalia",
              iucnRedListCategory: "EN",
              year: 2022,
              decimalLatitude: 31.641,
              decimalLongitude: -6.445,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const bio = await fetchBiodiversityContext({
      bbox: [-6.55, 31.55, -6.35, 31.75],
      caseId: "case_loc_test_123456",
      slug: "test",
      hash6: "123456",
      placeName: "Aït Bouguemez",
      regionName: "Azilal, Morocco",
      geoId: "geo_loc_test_123456",
      now: "2026-11-01T12:00:00.000Z",
    });

    expect(bio.speciesCount).toBe(2);
    expect(bio.topSpecies[0]).toMatchObject({
      scientificName: "Juniperus thurifera",
      kingdom: "Plantae",
      count: 2,
      iucn: "LC",
    });
    expect(bio.topSpecies[1]).toMatchObject({
      scientificName: "Macaca sylvanus",
      kingdom: "Animalia",
      count: 1,
      iucn: "EN",
    });
    expect(bio.sources).toHaveLength(1);
    expect(bio.evidence).toHaveLength(1);
    expect(() => Source.parse(bio.sources[0])).not.toThrow();
    expect(() => Evidence.parse(bio.evidence[0])).not.toThrow();
  });

  it("renders authentic DEM relief without synthetic sine-wave exaggeration and samples real landCoverGrid", async () => {
    const size = 16;
    const elevations: number[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Gentle 300 m relief (from 1800 m to 2100 m)
        elevations.push(1800 + (r / (size - 1)) * 300);
      }
    }

    const lcSize = 8;
    const tree = new Array<number>(lcSize * lcSize).fill(210);
    const crop = new Array<number>(lcSize * lcSize).fill(140);

    const terrain: TerrainFile = {
      version: 1,
      gridSize: size,
      width: size,
      height: size,
      bbox: [-6.55, 31.55, -6.35, 31.75],
      minElevationM: 1800,
      maxElevationM: 2100,
      elevations,
      catchmentRing: [
        [-6.52, 31.58],
        [-6.38, 31.58],
        [-6.38, 31.72],
        [-6.52, 31.72],
        [-6.52, 31.58],
      ],
      streamPaths: [
        [
          [-6.5, 31.6],
          [-6.45, 31.65],
          [-6.4, 31.7],
        ],
      ],
      landCoverGrid: {
        width: lcSize,
        height: lcSize,
        tree,
        crop,
      },
    };

    const overview = await overviewDataFromTerrain(terrain);
    // Span across the full DEM grid stays authentic (~300m) instead of being forced to >= 1050m with synthetic spurs
    let fullMin = Infinity;
    let fullMax = -Infinity;
    for (const h of overview.relief) {
      if (h < fullMin) fullMin = h;
      if (h > fullMax) fullMax = h;
    }
    const fullSpan = fullMax - fullMin;
    expect(fullSpan).toBeGreaterThanOrEqual(280);
    expect(fullSpan).toBeLessThanOrEqual(320);

    // Interior catchment range (~70% of bbox latitude span -> ~200m) also stays un-exaggerated
    const catchmentSpan = overview.range.max - overview.range.min;
    expect(catchmentSpan).toBeGreaterThanOrEqual(180);
    expect(catchmentSpan).toBeLessThanOrEqual(240);

    // Check that landcover pixels inside the catchment received the real landCoverGrid values (tree=210, crop=140)
    const lcData = (overview.landcover as unknown as { data?: Uint8ClampedArray }).data;
    if (lcData) {
      const centerIdx = (128 * 256 + 128) * 4;
      expect(lcData[centerIdx]).toBe(210);
      expect(lcData[centerIdx + 1]).toBe(140);
      expect(lcData[centerIdx + 2]).toBe(255);
    }
  });
});
