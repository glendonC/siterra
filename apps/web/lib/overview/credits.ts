// Source credits and short dataset names for the valley overview chrome (SourcesLine & SourcesPanel).
// Preserves the static seed credits while deriving dynamic dataset credits for ingested places.

import type { CaseSnapshot } from "@siterra/contracts";
import { en, type MessageId } from "../copy/en";
import type { Place } from "../instruments/valley/context";
import { reference } from "./record";

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

/**
 * Builds the `lines` (full attributions in SourcesPanel) and `short` (compact names in SourcesLine)
 * for the overview. For dynamically ingested places (`case_loc_...`), derives credits from the
 * case's `DataBundle` and `Source` records instead of hardcoding MODIS/CHIRPS.
 */
export function buildOverviewSourceSet(
  snapshot: CaseSnapshot,
  namedOrigin: Place | null,
  lifeCredit: { attribution?: string | null; label: string } | null,
): OverviewSourceSet {
  if (!snapshot.case.id.startsWith("case_loc_")) {
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

  for (const b of snapshot.records.dataBundleRecords) {
    const line = (b.attribution ?? b.label).trim();
    if (line) lineSet.add(line);

    const hay = `${b.datasetId} ${b.label} ${b.attribution ?? ""}`.toLowerCase();
    if (hay.includes("copernicus") || hay.includes("glo-30") || hay.includes("dem")) {
      shortSet.add("Copernicus DEM GLO-30");
    } else if (hay.includes("era5") || hay.includes("open-meteo") || hay.includes("meteo")) {
      shortSet.add("ERA5 / Open-Meteo");
    } else if (hay.includes("osm") || hay.includes("openstreetmap") || hay.includes("overpass")) {
      shortSet.add("OpenStreetMap");
    } else if (b.datasetId.trim()) {
      shortSet.add(b.datasetId.trim());
    }
  }

  for (const src of snapshot.records.sourceRecords) {
    const hay = `${src.title} ${src.publisher ?? ""} ${src.url}`.toLowerCase();
    if (src.sourceKind === "peer_reviewed" || hay.includes("openalex") || hay.includes("doi.org")) {
      shortSet.add("OpenAlex");
      lineSet.add(reference(src, []));
    } else if (hay.includes("copernicus") || hay.includes("dem")) {
      shortSet.add("Copernicus DEM GLO-30");
    } else if (hay.includes("era5") || hay.includes("open-meteo")) {
      shortSet.add("ERA5 / Open-Meteo");
    } else if (hay.includes("openstreetmap") || hay.includes("overpass")) {
      shortSet.add("OpenStreetMap");
    }
  }

  if (lineSet.size === 0) {
    for (const id of CREDITS) lineSet.add(en[id].text);
  }
  if (shortSet.size === 0) {
    shortSet.add("Copernicus DEM GLO-30");
    shortSet.add("ERA5 / Open-Meteo");
    shortSet.add("OpenStreetMap");
    shortSet.add("OpenAlex");
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
