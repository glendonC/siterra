import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { CaseSeedRecords } from "@siterra/db";
import type { SynthesizedCasePackage } from "./snapshot-synthesizer.ts";
import { type TerrainFile, polygonAreaM2 } from "./terrain-builder.ts";

const REPO_ROOT = process.cwd().endsWith("/apps/web")
  ? resolve(process.cwd(), "..", "..")
  : process.cwd();

export function placeCachePath(caseId: string): string {
  const safeId = caseId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(REPO_ROOT, ".local", "cache", "places", `${safeId}.json`);
}

export interface IngestPlaceInput {
  lon: number;
  lat: number;
  placeName?: string | undefined;
  regionName?: string | undefined;
  question?: string | undefined;
}

export interface IngestPlaceOutcome {
  caseId: string;
  created: boolean;
  placeName: string;
  regionName: string;
  question: string;
  outlet: [number, number];
  bbox: [number, number, number, number];
}

/** Cache format version for serialized live-place bundles on disk. */
export const PLACE_CACHE_VERSION = 2;

/**
 * The live pipeline's method and version, stamped on every live bundle; run-reingest.ts treats a case built by
 * any other version as stale.
 */
export const LIVE_PIPELINE = {
  methodId: "open_meteo_era5_watershed_series",
  version: "2.2.0",
} as const;

export interface CachedPlaceBundle {
  version: typeof PLACE_CACHE_VERSION;
  /** The TerrainFile version the record was built from; a different terrain version makes the record stale. */
  terrainVersion: number;
  outcome: Omit<IngestPlaceOutcome, "created">;
  seed: CaseSeedRecords;
  synth: SynthesizedCasePackage;
  occurrences?: Record<string, unknown>;
}

/** A live place's whole record, built from the live sources; nothing is written or cached. */
export interface LiveCaseBuild {
  outcome: Omit<IngestPlaceOutcome, "created">;
  seed: CaseSeedRecords;
  synth: SynthesizedCasePackage;
  /** Open-Meteo did not answer: the rainfall values are missing with a reason. */
  rainUnavailable: boolean;
  /** The 20 km box holds no land (outline kind box, fallback no_land). */
  noLand: boolean;
  terrainVersion: number;
  occurrences: Record<string, unknown> | null;
}

function makeSlug(text: string): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 26)
    .replace(/_+$/g, "");
  return cleaned.length > 0 && /^[a-z0-9]/.test(cleaned) ? cleaned : "catchment";
}

export function deterministicCaseId(
  lon: number,
  lat: number,
  placeName: string,
): { caseId: string; slug: string; hash6: string } {
  const slug = makeSlug(placeName);
  const coordKey = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  const hash6 = createHash("sha256").update(coordKey).digest("hex").slice(0, 6);
  return { caseId: `case_loc_${slug}_${hash6}`, slug, hash6 };
}

/** The outline's name, role, method and limits as the GeoSelection states them, from TerrainFile.outline. */
export interface OutlineDescription {
  label: string;
  boundaryRole: "hydrological_unit" | "landscape_sample";
  selectionMethod: string;
  areaMethod: string;
  limitations: string[];
  areaKm2: number;
  areaM2: number;
  /** The polygon ring the GeoSelection holds: the terrain's outline, or the box when that ring is unusable. */
  ring: [number, number][];
  /** Whether the area is an upstream drainage area (a watershed, or the part of one inside the box). */
  drains: boolean;
}

const ELEVATION_SOURCE_WORDS: Record<NonNullable<TerrainFile["elevationSource"]>, string> = {
  terrarium_z12: "AWS Terrain Tiles (Terrarium encoding, zoom 12)",
  terrarium_z11: "AWS Terrain Tiles (Terrarium encoding, zoom 11)",
  open_meteo_16: "the Open-Meteo Elevation API (16 by 16 points, interpolated)",
};

export function describeOutline(
  terrain: Pick<TerrainFile, "outline" | "elevationSource" | "catchmentRing" | "bbox">,
  placeName: string,
  lon: number,
  lat: number,
): OutlineDescription {
  const box = `the 20 km box centred at ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  const dem =
    terrain.elevationSource === undefined
      ? "an elevation grid whose source is not recorded"
      : ELEVATION_SOURCE_WORDS[terrain.elevationSource];
  const notSurveyed = "Not a surveyed watershed, legal parcel or management boundary.";
  // A polygon ring needs four positions (three corners and the closing one); a shorter outline is not used
  const ringUsable = terrain.catchmentRing.length >= 4;
  const [minLon, minLat, maxLon, maxLat] = terrain.bbox;
  const boxRing: [number, number][] = [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
  const ring = ringUsable ? terrain.catchmentRing : boxRing;
  const kind = ringUsable ? terrain.outline?.kind : undefined;
  const fallback = ringUsable ? terrain.outline?.fallback : undefined;
  const gridArea = ringUsable ? terrain.outline?.areaKm2 : undefined;
  const areaKm2 = gridArea ?? Number((polygonAreaM2(ring) / 1e6).toFixed(1));
  const areaM2 = Math.round(areaKm2 * 1e6);
  const areaMethod =
    gridArea === undefined
      ? `Geodesic polygon area on the WGS84 ellipsoid (${areaKm2.toFixed(1)} km²).`
      : `Area of the elevation grid cells inside the outline (${areaKm2.toFixed(1)} km²).`;
  if (kind === "watershed")
    return {
      label: `${placeName} watershed`,
      boundaryRole: "hydrological_unit",
      selectionMethod: `Within ${box}: everything draining through the outlet, traced by D8 flow on ${dem}; the whole watershed lies inside the box.`,
      areaMethod,
      limitations: [`Traced from ${dem}, not mapped.`, notSurveyed],
      areaKm2,
      areaM2,
      ring,
      drains: true,
    };
  if (kind === "drainage_within_box")
    return {
      label: "Drainage area within the 20 km box",
      boundaryRole: "landscape_sample",
      selectionMethod: `Within ${box}: the area draining through the outlet, traced by D8 flow on ${dem}; the box cuts it, so it is part of a larger watershed.`,
      areaMethod,
      limitations: [
        "Part of a larger watershed: the box edge cuts the drainage area, so its area is a lower bound.",
        `Traced from ${dem}, not mapped.`,
        notSurveyed,
      ],
      areaKm2,
      areaM2,
      ring,
      drains: true,
    };
  if (kind === "land_within_box")
    return {
      label: "Land within the 20 km box",
      boundaryRole: "landscape_sample",
      selectionMethod:
        fallback === "outline_degenerate"
          ? `Within ${box}: the land around the point, clipped at water, from ${dem}. No watershed is drawn, because the basin outline had too few cells to draw.`
          : `Within ${box}: the land around the point, clipped at water, from ${dem}. No watershed is drawn, because the basin through the point is a small share of the box's land.`,
      areaMethod,
      limitations: [
        "Not a watershed: the land around the chosen point inside the box.",
        notSurveyed,
      ],
      areaKm2,
      areaM2,
      ring,
      drains: false,
    };
  if (kind === "box") {
    const noLand = fallback === "no_land";
    return {
      label: noLand ? "The 20 km box (no land in it)" : "The 20 km box (no outline could be drawn)",
      boundaryRole: "landscape_sample",
      selectionMethod: noLand
        ? `All of ${box}, from ${dem}: no land was found in the box, so the box itself is the outline.`
        : `All of ${box}, from ${dem}: no outline of the land or basin could be drawn, so the box itself stands in for it.`,
      areaMethod,
      limitations: [
        noLand
          ? "No land in the 20 km box: the whole box is water."
          : "No outline could be drawn inside the box, so the record holds the whole box.",
        notSurveyed,
      ],
      areaKm2,
      areaM2,
      ring,
      drains: false,
    };
  }
  return {
    label: "Area within the 20 km box",
    boundaryRole: "landscape_sample",
    selectionMethod: ringUsable
      ? `Within ${box}, from ${dem}; how the outline was drawn is not recorded in this terrain file.`
      : `All of ${box}, from ${dem}. The drawn outline had fewer than four points, so the whole box stands in for it.`,
    areaMethod,
    limitations: [
      ringUsable
        ? "How the outline was drawn is not recorded, so it is not called a watershed."
        : "No usable outline: the terrain's ring had fewer than four points, so the record holds the whole box.",
      notSurveyed,
    ],
    areaKm2,
    areaM2,
    ring,
    drains: false,
  };
}
