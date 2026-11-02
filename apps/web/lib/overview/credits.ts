// Source credits and short dataset names for the valley overview chrome (SourcesLine & SourcesPanel).
// Preserves the static seed credits while deriving dynamic dataset credits for ingested places from the
// case's DataBundle, Source, and TerrainFile.elevationSource records.

import type { CaseSnapshot } from "@siterra/contracts";
import { en, type MessageId } from "../copy/en";
import type { Place } from "../instruments/valley/context";
import { reference } from "./record";

export type ElevationSourceInput =
  | {
      kind: "terrarium_z12" | "terrarium_z11" | "open_meteo_16";
      despikedPixels?: number;
    }
  | "terrarium_z12"
  | "terrarium_z11"
  | "open_meteo_16";

export const CREDITS: readonly MessageId[] = [
  "instrument.credit.modisNdvi",
  "instrument.credit.chirps",
  "instrument.credit.worldcover",
  "instrument.credit.dem",
];

/** The data's short names for the one visible line. */
export const SHORT: readonly MessageId[] = [
  "source.modis",
  "source.chirps",
  "source.worldcover",
  "source.dem",
];

export interface OverviewSourceSet {
  lines: string[];
  short: string[];
}

function elevationCreditOf(
  elevationSource: ElevationSourceInput | null | undefined,
): { short: string; line: string } | null {
  if (!elevationSource) return null;
  const kind = typeof elevationSource === "string" ? elevationSource : elevationSource.kind;
  const despikedPixels =
    typeof elevationSource === "string" ? 0 : (elevationSource.despikedPixels ?? 0);
  const despiked = despikedPixels > 0 ? ` (${String(despikedPixels)} despiked pixels)` : "";
  switch (kind) {
    case "terrarium_z12":
      return {
        short: "AWS Terrarium z12",
        line: `Terrain Tiles (Mapzen / AWS Open Data) at zoom 12${despiked}`,
      };
    case "terrarium_z11":
      return {
        short: "AWS Terrarium z11",
        line: `Terrain Tiles (Mapzen / AWS Open Data) at zoom 11${despiked}`,
      };
    case "open_meteo_16":
      return {
        short: "Open-Meteo Elevation (90 m)",
        line: `Open-Meteo 16x16 elevation grid (Copernicus DEM GLO-90, 90 m)${despiked}`,
      };
  }
}

/**
 * Builds the `lines` (full attributions in SourcesPanel) and `short` (compact names in SourcesLine)
 * for the overview. For dynamically ingested places (`case_loc_...`), derives credits from the
 * case's `DataBundle`, `Source`, and `TerrainFile.elevationSource` records instead of hardcoding MODIS/CHIRPS.
 */
export function buildOverviewSourceSet(
  snapshot: CaseSnapshot,
  namedOrigin: Place | null,
  lifeCredit: { attribution?: string | null; label: string } | null,
  elevationSource?: ElevationSourceInput | null,
): OverviewSourceSet {
  const isDynamicCase =
    snapshot.case.id.startsWith("case_loc_") ||
    snapshot.records.dataBundleRecords.some((b) => b.id.startsWith("bundle_loc_")) ||
    elevationSource != null;
  if (!isDynamicCase) {
    const lines = [
      ...CREDITS.map((id) => en[id].text),
      ...(namedOrigin ? [namedOrigin.attribution] : []),
    ];
    const short = [
      ...SHORT.map((id) => en[id].text),
      ...(namedOrigin ? [en["source.geonames"].text] : []),
    ];
    if (lifeCredit) {
      lines.push(lifeCredit.attribution ?? lifeCredit.label);
      short.push(en["source.gbif"].text);
    }
    return { lines, short };
  }

  const lineSet = new Set<string>();
  const shortSet = new Set<string>();

  const elev = elevationCreditOf(elevationSource);
  if (elev) {
    shortSet.add(elev.short);
    lineSet.add(elev.line);
  }

  for (const b of snapshot.records.dataBundleRecords) {
    const hay = `${b.datasetId} ${b.label} ${b.attribution ?? ""}`.toLowerCase();
    const mentionsRelief =
      hay.includes("terrarium") ||
      hay.includes("copernicus dem") ||
      hay.includes("glo-30") ||
      b.datasetId.toLowerCase().includes("dem") ||
      b.datasetId.toLowerCase().includes("relief");
    const mentionsOtherDataset =
      hay.includes("worldcover") ||
      hay.includes("era5") ||
      hay.includes("open-meteo") ||
      hay.includes("openstreetmap") ||
      hay.includes("overpass") ||
      hay.includes("modis") ||
      hay.includes("chirps");

    if (mentionsRelief && !mentionsOtherDataset) {
      if (!elev) {
        const line = (b.attribution ?? b.label).trim();
        if (line) lineSet.add(line);
        if (hay.includes("terrarium")) {
          shortSet.add(
            hay.includes("z11") || hay.includes("zoom 11")
              ? "AWS Terrarium z11"
              : "AWS Terrarium z12",
          );
        } else {
          shortSet.add("Copernicus DEM GLO-30");
        }
      }
      continue;
    }

    const rawLine = (b.attribution ?? b.label).trim();
    if (rawLine) {
      const clauses = rawLine
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const clause of clauses) {
        const low = clause.toLowerCase();
        if (
          elev &&
          (low.startsWith("elevation:") ||
            low.includes("terrarium") ||
            low.includes("copernicus dem") ||
            low.includes("glo-30"))
        ) {
          continue;
        }
        lineSet.add(clause);
      }
    }

    let matchedKnown = false;
    if (hay.includes("worldcover")) {
      shortSet.add("ESA WorldCover 10 m 2021");
      matchedKnown = true;
    }
    if (hay.includes("era5") || hay.includes("open-meteo") || hay.includes("meteo")) {
      shortSet.add("ERA5 / Open-Meteo");
      matchedKnown = true;
    }
    if (hay.includes("osm") || hay.includes("openstreetmap") || hay.includes("overpass")) {
      shortSet.add("OpenStreetMap");
      matchedKnown = true;
    }
    if (hay.includes("modis")) {
      shortSet.add(en["source.modis"].text);
      matchedKnown = true;
    }
    if (hay.includes("chirps")) {
      shortSet.add(en["source.chirps"].text);
      matchedKnown = true;
    }
    if (!matchedKnown && b.datasetId.trim()) {
      shortSet.add(b.datasetId.trim());
    }
  }

  for (const src of snapshot.records.sourceRecords) {
    if (src.accessStatus === "unavailable") continue;
    const hay = `${src.title} ${src.publisher ?? ""} ${src.url}`.toLowerCase();
    const rawTitle = src.title.replace(/\s*\u2014\s*/g, ", ");
    const datasetLine = src.publisher ? `${rawTitle} (${src.publisher})` : rawTitle;
    if (src.sourceKind === "peer_reviewed" || hay.includes("openalex") || hay.includes("doi.org")) {
      shortSet.add("OpenAlex");
      lineSet.add(reference(src, []));
    } else if (hay.includes("worldcover")) {
      shortSet.add("ESA WorldCover 10 m 2021");
      lineSet.add(datasetLine);
    } else if (hay.includes("era5") || hay.includes("open-meteo")) {
      shortSet.add("ERA5 / Open-Meteo");
      lineSet.add(datasetLine);
    } else if (hay.includes("openstreetmap") || hay.includes("overpass")) {
      shortSet.add("OpenStreetMap");
      lineSet.add(datasetLine);
    } else if (!elev && (hay.includes("copernicus dem") || hay.includes("glo-30"))) {
      shortSet.add("Copernicus DEM GLO-30");
      lineSet.add(datasetLine);
    }
  }

  if (namedOrigin) {
    lineSet.add(namedOrigin.attribution);
    shortSet.add(en["source.geonames"].text);
  }
  if (lifeCredit) {
    lineSet.add(lifeCredit.attribution ?? lifeCredit.label);
    shortSet.add(en["source.gbif"].text);
  }

  return {
    lines: [...lineSet],
    short: [...shortSet],
  };
}
