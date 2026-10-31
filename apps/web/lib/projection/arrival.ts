// What the arrival view shows, projected from one case revision. The case record is authoritative: the
// area, its role and the mode come from records, and a missing boundary is shown as missing.

import type { CaseSnapshot, GeoSelection } from "@siterra/contracts";
import type { MessageId } from "../copy/en";
import { dataCredits } from "./notices";
import { contextLand, type ContextLand } from "./places";
import type { Feature, Polygon } from "../stage/geo";

/** The mode line and the line under it, from the case record's mode. */
export interface ModeLines {
  label: MessageId;
  detail: MessageId;
}

export type ArrivalProjection =
  | {
      kind: "ready";
      caseId: string;
      caseRevision: number;
      /** The case's question, from the record (EnvironmentalCase.objective). */
      question: string;
      /** Study valley name derived from the case record. */
      valleyName: string;
      /** How the record names its area ("Valley catchment"), from the active GeoSelection's label. */
      areaLabel: string;
      /** Mountain region and country derived from the case's source records; the globe's case card and its range
       * line both use it, so the two never name the region differently. */
      regionName: string;
      modeLines: ModeLines;
      /** Data credits from the case's bundles, for Sources and notices. */
      dataCredits: string[];
      /** Villages, the outlet and their credits, from the case's ContextFeature records. */
      land: ContextLand;
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
      question: string;
      valleyName: string;
      areaLabel: string;
      regionName: string;
      modeLines: ModeLines;
      mode: MessageId;
      limitations: string[];
    };

const MODE: Record<CaseSnapshot["case"]["mode"], MessageId> = {
  live: "mode.live",
  replay: "mode.replay",
  concept: "mode.concept",
};

const MODE_DETAIL: Record<CaseSnapshot["case"]["mode"], MessageId> = {
  live: "mode.liveDetail",
  replay: "mode.replayDetail",
  concept: "mode.conceptDetail",
};

/** The only place a mode label is chosen: a Live label exists only for a record whose mode is live. */
export function modeLines(mode: CaseSnapshot["case"]["mode"]): ModeLines {
  return { label: MODE[mode], detail: MODE_DETAIL[mode] };
}

/** The arrival when the case's analysis boundary is established. */
export type ReadyArrival = Extract<ArrivalProjection, { kind: "ready" }>;

/** km² to one decimal from m² (design-system precision rule). */
export function formatAreaKm2(areaM2: number): string {
  return (areaM2 / 1e6).toFixed(1);
}

function activeSelection(s: CaseSnapshot): GeoSelection | undefined {
  const id = s.case.activeGeoSelectionId;
  return s.records.geoSelectionRecords.find((g) => g.id === id);
}

/** Extracts the study valley and its mountain region and country from the case and source records. */
export function placeNamesFromCase(s: CaseSnapshot): {
  valleyName: string;
  areaLabel: string;
  regionName: string;
} {
  // the record's own place when it names one (U25: every place reads by its own names); an older record without
  // one keeps the reading of its title and sources
  const place = s.case.place;
  const valleyMatch = /\bin the\s+(.+)$/i.exec(s.case.title);
  const valleyName = place?.name ?? valleyMatch?.[1]?.trim() ?? s.case.title;
  // the record's own name for its area: the active GeoSelection's label before its qualifying parenthesis
  const label = activeSelection(s)?.label ?? "";
  const areaLabel = label.replace(/\s*\(.*$/, "").trim() || valleyName;
  if (place) return { valleyName, areaLabel, regionName: place.region };
  for (const src of s.records.sourceRecords) {
    const m = /\(([^(),]+),\s*([^(),]+)\)/.exec(src.title);
    if (m?.[1] && m[2]) {
      const sub = m[1].trim();
      const country = m[2].trim();
      const subrangeName = /\bMountains\b/i.test(sub) ? sub : `${sub} Mountains`;
      const regionName = `${subrangeName}, ${country}`;
      return { valleyName, areaLabel, regionName };
    }
  }
  return {
    valleyName,
    areaLabel,
    regionName: s.case.title,
  };
}

export function projectArrival(s: CaseSnapshot): ArrivalProjection {
  const names = placeNamesFromCase(s);
  const base = {
    caseId: s.case.id,
    caseRevision: s.case.revision,
    mode: MODE[s.case.mode],
    modeLines: modeLines(s.case.mode),
    question: s.case.objective,
    ...names,
    dataCredits: dataCredits(s),
    land: contextLand(s),
  };
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
