import {
  Evidence,
  Hypothesis,
  type Provenance,
} from "@siterra/contracts";
import type { SynthesizeCasePackageInput } from "./case-synthesizer.ts";
import { rainTrendText } from "./climate-series.ts";
import type { LlmCauseDraft } from "./llm-reasoner.ts";

export interface BuiltHypothesesAndEvidence {
  studyEv: Evidence;
  contextEv: Evidence;
  climateEv: Evidence;
  needUpper: Evidence;
  needValley: Evidence;
  llmVerifiedEvidence: Evidence[];
  hypotheses: Hypothesis[];
  noVegetation: string;
  hypIds: {
    hypRainId: string;
    hypGrazingId: string;
    hypLandId: string;
    hypSnowId: string;
    hypArtefactId: string;
  };
  llmCauseByExp: Map<string, LlmCauseDraft>;
}

/**
 * Builds the verified LLM evidence records, field-requirement evidence records,
 * and the 5 competing Hypotheses for a live place.
 */
export function buildHypothesesAndEvidence(
  input: SynthesizeCasePackageInput,
  ctx: {
    taskId: string;
    baseProv: (limitations: string[]) => Provenance;
  },
): BuiltHypothesesAndEvidence {
  const {
    caseId,
    slug,
    hash6,
    placeName,
    now,
    geoId,
    bandLimitM,
    terrain,
    climate,
    evidence,
    measurementIds,
    llmResult,
  } = input;
  const { taskId, baseProv } = ctx;

  const firstEvidence = evidence[0];
  if (!firstEvidence) {
    throw new Error("Expected at least one evidence record when building hypotheses.");
  }
  const studyEv =
    evidence.find((e) => e.claimKind === "scientific_context") ?? firstEvidence;
  const contextEv =
    evidence.find(
      (e) =>
        e.id.startsWith("ev_ctx_") ||
        e.id.startsWith("ev_gov_") ||
        e.id.startsWith("ev_wb_") ||
        e.id.startsWith("ev_fr_"),
    ) ?? studyEv;
  const climateEv =
    evidence.find((e) => e.id.startsWith("ev_climate_")) ?? studyEv;

  const llmVerifiedEvidence: Evidence[] = [];
  if (llmResult?.verifiedFindings) {
    for (let i = 0; i < llmResult.verifiedFindings.length; i++) {
      const vf = llmResult.verifiedFindings[i];
      if (!vf) continue;
      const parsedEv = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_llm_${slug}_${hash6}_${String(i + 1)}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: vf.statement,
        claimKind: "scientific_context",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: vf.sourceId,
              locator: "verified excerpt",
              excerpt: vf.exactQuote.slice(0, 260),
            },
          ],
          dataBundleIds: [],
          methodId: null,
          methodVersion: null,
          inputVersions: [{ entityId: vf.sourceId, revision: 1 }],
          generatedByTaskId: taskId,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "Independently verified verbatim quote extracted from retrieved source corpus.",
          ],
        },
        interpretation: vf.interpretation || null,
        uncertainty:
          "Published literature or regulatory excerpt; field verification required for site-level decisions.",
        reviewDecisionIds: [],
      });
      if (parsedEv.success) {
        llmVerifiedEvidence.push(parsedEv.data);
      }
    }
  }

  const needUpper = Evidence.parse({
    recordType: "Evidence",
    id: `ev_need_upper_${slug}_${hash6}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    statement: `Seasonal grazing, canopy, and stewardship schedules above ${String(bandLimitM)} m in ${placeName} must be checked with local managers; satellite series alone cannot separate rangeland management from micro-topographic moisture.`,
    claimKind: "field_requirement",
    status: "accepted",
    geoSelectionId: null,
    periodIds: [],
    measurementIds: [],
    provenance: {
      ...baseProv([
        "Field requirement derived from competing watershed explanations; local management schedules are not in the remote-sensing archive.",
      ]),
      verificationStatus: "unverified",
      sourceLocators: studyEv.provenance.sourceLocators.slice(0, 1),
    },
    interpretation: null,
    uncertainty: "Requires on-site consultation and local record verification.",
    reviewDecisionIds: [],
  });

  const needValley = Evidence.parse({
    recordType: "Evidence",
    id: `ev_need_valley_${slug}_${hash6}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    statement: `Valley-floor water diversions, cultivation history, and parcel management below ${String(bandLimitM)} m in ${placeName} must be verified locally to separate land-use change from climate-driven shift.`,
    claimKind: "field_requirement",
    status: "accepted",
    geoSelectionId: null,
    periodIds: [],
    measurementIds: [],
    provenance: {
      ...baseProv([
        "Field requirement derived from the competing valley-floor explanation; local diversion and planting histories require field collection.",
      ]),
      verificationStatus: "unverified",
      sourceLocators: contextEv.provenance.sourceLocators.slice(0, 1),
    },
    interpretation: null,
    uncertainty: "Requires local landholder and water-manager verification.",
    reviewDecisionIds: [],
  });

  // No vegetation series is measured for live places: rainfall cannot be compared with it
  const signedRain = rainTrendText(climate);
  const rainfallKnown =
    signedRain === null
      ? (climate.unavailableReason ?? "Rainfall is not measured either.")
      : `Annual rainfall changed by ${signedRain} mm per decade (${climate.source.window}); a vegetation series would decide whether vegetation followed it.`;
  const noVegetation =
    "Cannot be assessed with current data. Missing: a measured vegetation series (NDVI).";

  const hypRainId = `hyp_rain_${slug}_${hash6}`;
  const hypGrazingId = `hyp_grazing_${slug}_${hash6}`;
  const hypLandId = `hyp_land_${slug}_${hash6}`;
  const hypSnowId = `hyp_snow_${slug}_${hash6}`;
  const hypArtefactId = `hyp_artefact_${slug}_${hash6}`;
  const allHypIds = [hypRainId, hypGrazingId, hypLandId, hypSnowId, hypArtefactId];

  const llmHypByKey = new Map(
    (llmResult?.hypotheses ?? []).map((h) => [h.key, h] as const),
  );
  const llmCauseByExp = new Map<string, LlmCauseDraft>(
    (llmResult?.causes ?? []).map((c) => [c.explanationId, c] as const),
  );

  const makeHyp = (
    id: string,
    statement: string,
    status: Hypothesis["status"],
    assessment: string,
    supportingIds: string[],
    contradictingIds: string[],
    missing: string[],
  ): Hypothesis =>
    Hypothesis.parse({
      recordType: "Hypothesis",
      id,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      statement,
      status,
      supportingEvidenceIds: supportingIds,
      contradictingEvidenceIds: contradictingIds,
      alternativeHypothesisIds: allHypIds.filter((x) => x !== id),
      missingEvidence: missing,
      measurementIds: [
        ...new Set([
          measurementIds.catchmentTrendId,
          measurementIds.precipTrendId,
          measurementIds.rainR2Id,
          measurementIds.bandTrendId,
        ]),
      ],
      assessment,
      provenance: {
        ...baseProv([
          "A hypothesis is a candidate explanation, not proof. No vegetation series is measured for this place, so none is judged against one.",
        ]),
        verificationStatus: "unverified",
      },
    });

  const rainLlmHyp = llmHypByKey.get("rainfall");
  const grazingLlmHyp = llmHypByKey.get("grazing");
  const landLlmHyp = llmHypByKey.get("land_use");
  const snowLlmCause = llmCauseByExp.get("snow_terrain");
  const artefactLlmCause = llmCauseByExp.get("data_artefact");

  const hypotheses: Hypothesis[] = [
    makeHyp(
      hypRainId,
      rainLlmHyp?.statement ||
        `Year-to-year rainfall explains most vegetation change across ${placeName}.`,
      "inconclusive",
      rainLlmHyp?.assessment || `${noVegetation} ${rainfallKnown}`,
      [],
      [],
      [climate.vegetation.reason],
    ),
    makeHyp(
      hypGrazingId,
      grazingLlmHyp?.statement ||
        `Changes in upland grazing pressure, rangeland rotation, or canopy disturbance above ${String(bandLimitM)} m changed vegetation there in ${placeName}.`,
      "inconclusive",
      grazingLlmHyp?.assessment ||
        `${noVegetation} Also missing: seasonal grazing and stewardship schedules above ${String(bandLimitM)} m in ${placeName}.`,
      [studyEv.id, ...llmVerifiedEvidence.slice(0, 1).map((e) => e.id)],
      [],
      [needUpper.statement],
    ),
    makeHyp(
      hypLandId,
      landLlmHyp?.statement ||
        `Valley-floor land-use change, irrigation management, or parcel conversion below ${String(bandLimitM)} m changed vegetation there, apart from rainfall, in ${placeName}.`,
      "inconclusive",
      landLlmHyp?.assessment ||
        `${noVegetation} Also missing: valley-floor water diversions and parcel management records below ${String(bandLimitM)} m.`,
      [...new Set([contextEv.id, ...llmVerifiedEvidence.slice(1, 2).map((e) => e.id)])],
      [],
      [climate.vegetation.reason, needValley.statement],
    ),
    makeHyp(
      hypSnowId,
      snowLlmCause?.statement ||
        `Elevation-dependent snowmelt timing, aspect shading, and topographic moisture retention across ${terrain.minElevationM.toFixed(0)} to ${terrain.maxElevationM.toFixed(0)} m shaped how vegetation responded to rainfall in ${placeName}.`,
      "inconclusive",
      snowLlmCause?.statusReason ||
        `${noVegetation} Separating topographic moisture across ${terrain.minElevationM.toFixed(0)} to ${terrain.maxElevationM.toFixed(0)} m from upland and valley-floor management also needs field checks.`,
      [],
      [],
      [climate.vegetation.reason, needUpper.statement],
    ),
    makeHyp(
      hypArtefactId,
      artefactLlmCause?.statement ||
        `Sensor calibration drift, cloud-mask gaps, or reanalysis interpolation artefacts would produce a vegetation signal in ${placeName} without real ecological change.`,
      "inconclusive",
      artefactLlmCause?.statusReason ||
        `Cannot be assessed with current data. Missing: satellite scenes and their quality flags for ${placeName}.`,
      [],
      [],
      [climate.vegetation.reason],
    ),
  ];

  return {
    studyEv,
    contextEv,
    climateEv,
    needUpper,
    needValley,
    llmVerifiedEvidence,
    hypotheses,
    noVegetation,
    hypIds: {
      hypRainId,
      hypGrazingId,
      hypLandId,
      hypSnowId,
      hypArtefactId,
    },
    llmCauseByExp,
  };
}
