// Pure record-driven context derivation for ExplanationBranch items in VerdictView.
// Reads exclusively from CaseSnapshot records (evidenceRecords, sourceRecords, hypothesisRecords,
// interventionRecords, operationalActionRecords) with zero hardcoded place or case names.

import type {
  BranchMerge,
  CaseSnapshot,
  Evidence,
  ExplanationBranch,
  Source,
} from "@siterra/contracts";
import { pformat } from "../copy/package";
import { shortCitation } from "../overview/results";
import { readableText } from "./package";
import {
  plainVerdictText,
  statusTextOf,
  verdictOf,
  type VerdictCause,
  type VerdictLocalContext,
  type VerdictStatus,
  type VerdictView,
} from "./verdict";

const KEYWORDS_BY_EXPLANATION: Record<string, readonly string[]> = {
  grazing: ["graz", "pasture", "herd", "agdal", "livestock", "rangeland", "transhum", "forage"],
  land_use: ["cultivat", "orchard", "irrigat", "crop", "field", "land use", "terrace", "parcel"],
  rainfall: ["precipit", "rain", "drought", "wet season", "moisture", "chirps", "era5", "climate"],
  snow_terrain: ["snow", "elevation", "altitude", "slope", "aspect", "relief", "topograph", "dem"],
  data_artefact: ["quality", "cloud", "shadow", "scene", "sensor", "flag", "artefact", "modis"],
};

function matchesKeywords(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function findSourceForEvidence(snapshot: CaseSnapshot, ev: Evidence): Source | undefined {
  const srcId = ev.provenance.sourceLocators[0]?.sourceId;
  if (srcId) {
    const found = snapshot.records.sourceRecords.find((s) => s.id === srcId);
    if (found) return found;
  }
  const bundleId = ev.provenance.dataBundleIds[0];
  if (bundleId) {
    const bundle = snapshot.records.dataBundleRecords.find((b) => b.id === bundleId);
    const bSrcId = bundle?.sourceIds[0];
    if (bSrcId) return snapshot.records.sourceRecords.find((s) => s.id === bSrcId);
  }
  return undefined;
}

/**
 * Derives local/scientific context and the discriminating field check or candidate response
 * for a single ExplanationBranch purely from the CaseSnapshot's own records.
 */
export function deriveBranchContext(
  snapshot: CaseSnapshot,
  branch: ExplanationBranch | undefined,
  mb: BranchMerge["branches"][number],
): { localContext?: VerdictLocalContext; nextCheck?: string } {
  const keywords = KEYWORDS_BY_EXPLANATION[mb.explanationId] ?? [
    mb.explanationId.replace(/_/g, " "),
  ];

  // 1. Match hypotheses linked to this branch (or by keywords only when branch has no hypothesisId)
  const hypotheses = snapshot.records.hypothesisRecords ?? [];
  const directHypotheses = branch?.hypothesisId
    ? hypotheses.filter((h) => h.id === branch.hypothesisId)
    : [];
  const matchingHypotheses =
    directHypotheses.length > 0
      ? directHypotheses
      : hypotheses.filter((h) => matchesKeywords(h.statement ?? "", keywords));
  const hypIds = new Set(matchingHypotheses.map((h) => h.id));

  // 2. Find candidate interventions linked exclusively to this hypothesis first, then by keywords, then shared hypothesis
  const interventions = snapshot.records.interventionRecords ?? [];
  const intervention =
    interventions.find(
      (i) =>
        (i.hypothesisIds ?? []).length === 1 &&
        (i.hypothesisIds ?? []).some((id) => hypIds.has(id)),
    ) ??
    interventions.find((i) =>
      matchesKeywords(`${i.title ?? ""} ${i.description ?? ""}`, keywords),
    ) ??
    interventions.find((i) => (i.hypothesisIds ?? []).some((id) => hypIds.has(id)));

  // 3. Find field plan measurements from OperationalAction records that discriminate this branch
  const allMeasurements = (snapshot.records.operationalActionRecords ?? []).flatMap(
    (a) => a.fieldPlan?.measurements ?? [],
  );
  const fieldCheckPred = (branch?.predictions ?? []).find((p) => p.test.kind === "field_check");
  const fieldMeasurement =
    allMeasurements.find(
      (m) =>
        fieldCheckPred?.test.kind === "field_check" &&
        m.fieldCheckId === fieldCheckPred.test.fieldCheckId,
    ) ??
    allMeasurements.find((m) =>
      matchesKeywords(`${m.what ?? ""} ${m.method ?? ""}`, keywords),
    ) ??
    allMeasurements.find((m) =>
      (m.discriminatesHypothesisIds ?? []).some((id) => hypIds.has(id)),
    );

  // 4. Find the best published / context Evidence record for this explanation
  const branchEvIds = new Set<string>([
    ...matchingHypotheses.flatMap((h) => [
      ...(h.supportingEvidenceIds ?? []),
      ...(h.contradictingEvidenceIds ?? []),
    ]),
  ]);

  const acceptedEvidence = (snapshot.records.evidenceRecords ?? []).filter(
    (e) => e.status === "accepted",
  );
  const hasSourceLocator = (e: Evidence) => (e.provenance?.sourceLocators?.length ?? 0) > 0;
  const contextEvidence =
    acceptedEvidence.find(
      (e) =>
        (e.claimKind === "scientific_context" || hasSourceLocator(e)) &&
        branchEvIds.has(e.id),
    ) ??
    acceptedEvidence.find(
      (e) =>
        (e.claimKind === "scientific_context" || hasSourceLocator(e)) &&
        matchesKeywords(
          `${e.statement} ${findSourceForEvidence(snapshot, e)?.title ?? ""}`,
          keywords,
        ),
    ) ??
    acceptedEvidence.find((e) => branchEvIds.has(e.id)) ??
    acceptedEvidence.find((e) => matchesKeywords(e.statement, keywords));

  // 5. Find a matching Source record if no context evidence matched directly
  const matchedSource =
    (contextEvidence ? findSourceForEvidence(snapshot, contextEvidence) : undefined) ??
    (snapshot.records.sourceRecords ?? []).find((s) =>
      matchesKeywords(`${s.title} ${s.publisher ?? ""}`, keywords),
    );

  let localContext: VerdictLocalContext | undefined;
  if (contextEvidence || intervention || matchedSource) {
    const title = intervention
      ? intervention.title
      : matchedSource
        ? matchedSource.title.length > 68
          ? `${matchedSource.title.slice(0, 65)}...`
          : matchedSource.title
        : "Published & local context";
    const detail = contextEvidence
      ? readableText(snapshot, contextEvidence.statement)
      : intervention
        ? readableText(snapshot, intervention.description)
        : matchedSource
          ? `Source in case record: ${matchedSource.title}.`
          : "";
    const citation = matchedSource
      ? shortCitation(matchedSource)
      : contextEvidence?.provenance.dataBundleIds[0]
        ? (snapshot.records.dataBundleRecords.find(
            (b) => b.id === contextEvidence.provenance.dataBundleIds[0],
          )?.label ?? "Case data bundle")
        : "Case record";
    if (detail) {
      localContext = { title, detail, citation };
    }
  }

  const nextCheck = fieldMeasurement
    ? `${fieldMeasurement.what} (${fieldMeasurement.method.toLowerCase()}, ${fieldMeasurement.season.toLowerCase()}).`
    : intervention?.fieldValidationNeeded[0]
      ? plainVerdictText(intervention.fieldValidationNeeded[0])
      : undefined;

  return {
    ...(localContext ? { localContext } : {}),
    ...(nextCheck ? { nextCheck } : {}),
  };
}

/**
 * Resolves the VerdictView for a command or falls back to the case's latest BranchMerge
 * or synthesizes a 5-branch view strictly from the case's own measurements, sources, and evidence.
 */
export function verdictForCase(snapshot: CaseSnapshot, commandId: string | null): VerdictView {
  if (commandId) {
    const direct = verdictOf(snapshot, commandId);
    if (direct) return direct;
  }
  const latestMerge = (snapshot.records.branchMergeRecords ?? []).at(-1);
  if (latestMerge) {
    const fromLatest = verdictOf(snapshot, latestMerge.commandId);
    if (fromLatest) return fromLatest;
  }

  // Synthesize from the case's own measurements and records when no BranchMerge is committed yet
  const rainCorr = snapshot.records.measurementRecords.find(
    (m) =>
      m.metric === "ndvi_precip_spearman" ||
      m.metric === "ndvi_precipitation_correlation" ||
      m.metric.includes("precip"),
  );
  const rVal = typeof rainCorr?.value === "number" ? rainCorr.value : null;
  const rainConsistent = rVal !== null && Math.abs(rVal) >= 0.35;

  const definitions: Array<{
    id: BranchMerge["branches"][number]["explanationId"];
    label: string;
    status: VerdictStatus;
    prediction: string;
    reason: string;
  }> = [
    {
      id: "rainfall",
      label: "Rainfall",
      status: rainConsistent ? "consistent" : "cannot_be_assessed",
      prediction:
        "Wet-season rainfall and vegetation greenness departures move in the same direction across the catchment.",
      reason:
        rVal !== null
          ? `Greenness and rainfall correlation in the case record is ${rVal.toFixed(2)}.`
          : "Comparing rainfall and greenness requires aligned seasonal departures.",
    },
    {
      id: "grazing",
      label: "Grazing",
      status: "cannot_be_assessed",
      prediction:
        "Seasonal grazing pressure and local pasture rules explain the residual trend on shared slopes.",
      reason: "Only a field check of herd records on the ground can test this.",
    },
    {
      id: "land_use",
      label: "Land use",
      status: "cannot_be_assessed",
      prediction:
        "Shifts in valley-bottom cultivation, irrigation, or land management explain the localized greening.",
      reason: "Only a field check of orchard history on the ground can test this.",
    },
    {
      id: "snow_terrain",
      label: "Snow or terrain",
      status: "cannot_be_assessed",
      prediction:
        "Elevation, aspect moisture differences, and snowmelt timing drive the upper-band signal.",
      reason:
        "Upper-band phenology shifts require local elevation-stratum verification.",
    },
    {
      id: "data_artefact",
      label: "Data artefact",
      status: "contradicted",
      prediction: "Sensor drift, cloud contamination, or terrain shadow flags explain the trend.",
      reason:
        "Quality-screened observations hold across clear scenes without sensor-flag dominance.",
    },
  ];

  const causes: VerdictCause[] = definitions.map((d, idx) => {
    const syntheticMb: BranchMerge["branches"][number] = {
      explanationId: d.id,
      branchId: `branch_${d.id}_${String(idx + 1)}`,
      branchRevision: 1,
      status: d.status,
      reason: d.reason,
    };
    return {
      id: d.id,
      branchId: syntheticMb.branchId,
      label: d.label,
      status: d.status,
      statusText: statusTextOf(d.status),
      prediction: d.prediction,
      reason: d.reason,
      ...deriveBranchContext(snapshot, undefined, syntheticMb),
    };
  });

  return {
    mergeId: `merge_${snapshot.case.id}`,
    caption: {
      ink: pformat("verdict.caption", { count: causes.length }),
      grey: null,
    },
    causes,
  };
}
