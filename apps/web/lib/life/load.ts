// Recorded life on the land (UI-2): the case's own species occurrence bundle, found by its record's method (never by
// a place's name), and its kept records read through the read API, refused unless their sha256 is the checksum the
// API serves (lib/time/load). A case without a validated species bundle shows no layer and offers no key.

import type { CaseSnapshot } from "@siterra/contracts";
import { readAsset } from "../time/load";
import {
  occurrencesFrom,
  pointsOf,
  summaryOf,
  type LifeSummary,
  type Occurrences,
  type RecordedPoint,
} from "./data";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The asset of kept records in the bundle (species_occurrences 1.0.0). */
export const OCCURRENCES_ASSET = "occurrences";

/** The case's species occurrence bundle, by method; null when the case holds none. */
export function lifeSourceOf(snapshot: CaseSnapshot): string | null {
  return (
    snapshot.records.dataBundleRecords
      .filter((b) => b.methodId === "species_occurrences" && b.status === "validated")
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null
  );
}

export interface LifeData {
  occurrences: Occurrences;
  points: RecordedPoint[];
  summary: LifeSummary;
}

/** The kept records and the points they are drawn at, in the land's UTM zone. */
export async function loadLife(
  caseId: string,
  bundleId: string,
  zone: number,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<LifeData> {
  const bytes = await readAsset(caseId, bundleId, OCCURRENCES_ASSET, fetchImpl, signal);
  const occurrences = occurrencesFrom(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  const points = pointsOf(occurrences, zone);
  return { occurrences, points, summary: summaryOf(occurrences, points) };
}
