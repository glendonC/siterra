// What the scenes take from the case record about the land, rather than from code: the equal-area elevation bands'
// two limits (the record's elevation_band_limit measurements on the active area, lowest first).

import type { CaseSnapshot } from "@siterra/contracts";

/** The lower and upper elevation band limits (m), or null when the record holds other than two. */
export function bandLimitsOf(snapshot: CaseSnapshot): readonly [number, number] | null {
  const values = snapshot.records.measurementRecords
    .filter(
      (m) =>
        m.metric === "elevation_band_limit" &&
        m.status === "available" &&
        m.geoSelectionId === snapshot.case.activeGeoSelectionId &&
        m.value !== null,
    )
    .map((m) => m.value as number)
    .sort((a, b) => a - b);
  const [lower, upper] = values;
  return values.length === 2 && lower !== undefined && upper !== undefined ? [lower, upper] : null;
}
