// The located points the arrival names on the land, and their credits, from the case's ContextFeature
// records. Each point is credited for exactly its own source, in the record's words; a case without
// context features shows no point and no place credit. These points are not evidence.

import type { CaseSnapshot, ContextFeature } from "@siterra/contracts";
import { en } from "../copy/en";

export interface LandPoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

export interface PlaceCredit {
  id: string;
  name: string;
  attribution: string;
}

export interface ContextLand {
  /** Villages on stems, in record order. */
  places: LandPoint[];
  outlet: LandPoint | undefined;
  /** One credit per point that records one, for Sources and notices. */
  credits: PlaceCredit[];
  /** What the credit line adds for the points on the land, or empty. */
  creditLine: string;
}

const PLACE_ROLES: ContextFeature["role"][] = ["settlement", "settlement_locator"];

function point(f: ContextFeature): LandPoint {
  const [lon, lat] = f.geometry.coordinates;
  return { id: f.id, name: f.name, lon, lat };
}

/** The outlet's record names OpenStreetMap as its input (one coordinate, ODbL). */
function usesOpenStreetMap(f: ContextFeature): boolean {
  return /OpenStreetMap/.test(f.attribution ?? "") || /ODbL/.test(f.license ?? "");
}

export function contextLand(s: CaseSnapshot): ContextLand {
  const features = s.records.contextFeatureRecords ?? [];
  const placeFeatures = features.filter((f) => PLACE_ROLES.includes(f.role));
  const outletFeature = features.find((f) => f.role === "outlet");
  const credits = features.flatMap((f) =>
    f.attribution ? [{ id: f.id, name: f.name, attribution: f.attribution }] : [],
  );
  // the line keeps the approved frame's wording: OpenStreetMap for the outlet input; the place credits,
  // in their records' words, are in Sources and notices and Read flat
  const creditLine =
    outletFeature && usesOpenStreetMap(outletFeature) ? en["credit.outletInput"].text : "";
  return {
    places: placeFeatures.map(point),
    outlet: outletFeature ? point(outletFeature) : undefined,
    credits,
    creditLine,
  };
}
