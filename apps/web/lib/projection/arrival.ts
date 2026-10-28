// What the arrival view shows, projected from one case revision. The case record is authoritative: the
// area, its role and the mode come from records, and a missing boundary is shown as missing.

import type { CaseSnapshot, GeoSelection } from "@siterra/contracts";
import type { MessageId } from "../copy/en";
import type { Feature, Polygon } from "../stage/geo";

export type ArrivalProjection =
  | {
      kind: "ready";
      caseId: string;
      caseRevision: number;
      geoSelectionId: string;
      geoRevision: number;
      catchment: Feature<Polygon>;
      /** Area in km² to one decimal, as written on the land. */
      areaKm2: string;
      mode: MessageId;
    }
  | {
      kind: "boundary_not_established";
      caseId: string;
      caseRevision: number;
      mode: MessageId;
      limitations: string[];
    };

const MODE: Record<CaseSnapshot["case"]["mode"], MessageId> = {
  live: "mode.live",
  replay: "mode.replay",
  concept: "mode.concept",
};

/** km² to one decimal from m² (design-system precision rule). */
export function formatAreaKm2(areaM2: number): string {
  return (areaM2 / 1e6).toFixed(1);
}

function activeSelection(s: CaseSnapshot): GeoSelection | undefined {
  const id = s.case.activeGeoSelectionId;
  return s.records.geoSelectionRecords.find((g) => g.id === id);
}

export function projectArrival(s: CaseSnapshot): ArrivalProjection {
  const base = { caseId: s.case.id, caseRevision: s.case.revision, mode: MODE[s.case.mode] };
  const g = activeSelection(s);
  if (!g || g.geometryStatus !== "analysis_ready" || !g.geometry || g.areaM2 === null) {
    return { kind: "boundary_not_established", ...base, limitations: g?.limitations ?? [] };
  }
  return {
    kind: "ready",
    ...base,
    geoSelectionId: g.id,
    geoRevision: g.revision,
    catchment: {
      type: "Feature",
      properties: { id: g.id, revision: g.revision, role: g.boundaryRole },
      geometry: { type: "Polygon", coordinates: g.geometry.coordinates },
    },
    areaKm2: formatAreaKm2(g.areaM2),
    mode: MODE[s.case.mode],
  };
}
