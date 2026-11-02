import {
  BranchMerge,
  Brief,
  type BriefItem,
  Evidence,
  ExplanationBranch,
  Hypothesis,
  Intervention,
  OperationalAction,
  type Provenance,
  ResourceRequirement,
  ReviewDecision,
  type Source,
  Task,
} from "@siterra/contracts";
import { type HistoricalClimateSummary, rainTrendText } from "./climate-series.ts";
import type { LlmReasonerOutput } from "./llm-reasoner.ts";
import type { TerrainFile } from "./terrain-builder.ts";

export interface SynthesizeCasePackageInput {
  caseId: string;
  slug: string;
  hash6: string;
  placeName: string;
  regionName: string;
  question: string;
  now: string;
  geoId: string;
  bundleId: string;
  periodIds: string[];
  bandLimitM: number;
  terrain: Pick<TerrainFile, "minElevationM" | "maxElevationM">;
  climate: HistoricalClimateSummary;
  sources: readonly Source[];
  evidence: readonly Evidence[];
  measurementIds: {
    catchmentTrendId: string;
    precipTrendId: string;
    rainR2Id: string;
    fdrUpId: string;
    fdrDownId: string;
    bandTrendId: string;
    bandLimitId: string;
  };
  llmResult?: LlmReasonerOutput | null | undefined;
}

export interface SynthesizedCasePackage {
  commandId: string;
  task: Task;
  fieldRequirementEvidence: Evidence[];
  hypotheses: Hypothesis[];
  explanationBranches: ExplanationBranch[];
  branchMerge: BranchMerge;
  interventions: Intervention[];
  resourceRequirements: ResourceRequirement[];
  reviewDecisions: ReviewDecision[];
  operationalAction: OperationalAction;
  brief: Brief;
}

const SYNTH_MODEL = {
  model: "siterra-watershed-synthesizer-1",
  promptVersion: "synth@1",
  loopStatus: "accepted" as const,
  validationOutcome: "accepted" as const,
  failureCode: null,
  repaired: false,
};

/**
 * Synthesizes the complete competing-explanation tree (5 Hypotheses, 5 ExplanationBranches,
 * 1 BranchMerge) and next-steps decision package (3 Interventions grounded in local context,
 * 5 ResourceRequirements, 2 ReviewDecisions, 1 OperationalAction field plan, and 1 Brief)
 * for any location on Earth from its terrain elevation grid, Open-Meteo rainfall series (ERA5 reanalysis), OpenAlex
 * peer-reviewed studies, and regional governance/stewardship records.
 */
export function synthesizeCasePackage(
  input: SynthesizeCasePackageInput,
): SynthesizedCasePackage {
  const {
    caseId,
    slug,
    hash6,
    placeName,
    regionName,
    question,
    now,
    geoId,
    bundleId,
    periodIds,
    bandLimitM,
    terrain,
    climate,
    evidence,
    measurementIds,
    llmResult,
  } = input;

  const commandId = `cmd_synth_${slug}_${hash6}`;
  const taskId = `task_synth_${slug}_${hash6}`;
  const actionId = `act_field_${slug}_${hash6}`;
  const briefId = `brief_synth_${slug}_${hash6}`;

  const activeModel = llmResult
    ? {
        ...SYNTH_MODEL,
        model: llmResult.model,
        promptVersion: "llm-reasoner@1",
      }
    : SYNTH_MODEL;

  const baseProv = (limitations: string[]): Provenance => ({
    sourceLocators: [],
    dataBundleIds: [bundleId],
    methodId: "open_meteo_era5_watershed_series",
    methodVersion: "1.0.0",
    inputVersions: [{ entityId: bundleId, revision: 1 }],
    generatedByTaskId: taskId,
    generatedAt: now,
    verificationStatus: "computed_checked",
    limitations,
  });

  const studyEv =
    evidence.find((e) => e.claimKind === "scientific_context") ?? evidence[0]!;
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
      const vf = llmResult.verifiedFindings[i]!;
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
        uncertainty: "Published literature or regulatory excerpt; field verification required for site-level decisions.",
        reviewDecisionIds: [],
      });
      if (parsedEv.success) {
        llmVerifiedEvidence.push(parsedEv.data);
      }
    }
  }

  const needUpperId = `ev_need_upper_${slug}_${hash6}`;
  const needValleyId = `ev_need_valley_${slug}_${hash6}`;

  const needUpper = Evidence.parse({
    recordType: "Evidence",
    id: needUpperId,
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
    id: needValleyId,
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
  const noVegetation = "Cannot be assessed with current data. Missing: a measured vegetation series (NDVI).";

  const hypRainId = `hyp_rain_${slug}_${hash6}`;
  const hypGrazingId = `hyp_grazing_${slug}_${hash6}`;
  const hypLandId = `hyp_land_${slug}_${hash6}`;
  const hypSnowId = `hyp_snow_${slug}_${hash6}`;
  const hypArtefactId = `hyp_artefact_${slug}_${hash6}`;
  const allHypIds = [hypRainId, hypGrazingId, hypLandId, hypSnowId, hypArtefactId];

  const llmHypByKey = new Map(
    (llmResult?.hypotheses ?? []).map((h) => [h.key, h] as const),
  );
  const llmCauseByExp = new Map(
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
      rainLlmHyp?.assessment ||
        `${noVegetation} ${rainfallKnown}`,
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

  const bRainId = `branch_rain_${slug}_${hash6}`;
  const bGrazingId = `branch_grazing_${slug}_${hash6}`;
  const bLandId = `branch_land_${slug}_${hash6}`;
  const bSnowId = `branch_snow_${slug}_${hash6}`;
  const bArtefactId = `branch_artefact_${slug}_${hash6}`;

  const lastPeriod = periodIds[periodIds.length - 1] ?? "period_2024-06";

  const makeBranch = (params: {
    id: string;
    explanationId: string;
    label: string;
    statement: string;
    status: ExplanationBranch["status"];
    statusReason: string;
    hypothesisId: string;
    predictions: ExplanationBranch["predictions"];
    scores: ExplanationBranch["scores"];
  }): ExplanationBranch =>
    ExplanationBranch.parse({
      recordType: "ExplanationBranch",
      id: params.id,
      revision: 2,
      createdAt: now,
      updatedAt: now,
      caseId,
      commandId,
      taskId,
      explanationId: params.explanationId,
      label: params.label,
      statement: params.statement,
      status: params.status,
      statusReason: params.statusReason,
      predictions: params.predictions,
      predictedAt: now,
      predictionsCaseRevision: 1,
      scores: params.scores,
      scoredAt: now,
      model: activeModel,
      hypothesisId: params.hypothesisId,
      provenance: {
        ...baseProv([
          "Status set by the live synthesizer from what the record holds; no vegetation series is measured, so no prediction is scored.",
        ]),
        verificationStatus: "unverified",
      },
    });

  const rainCause = llmCauseByExp.get("rainfall");
  const grazingCause = llmCauseByExp.get("grazing");
  const landCause = llmCauseByExp.get("land_use");

  const explanationBranches: ExplanationBranch[] = [
    makeBranch({
      id: bRainId,
      explanationId: "rainfall",
      label: "Rainfall",
      statement: rainCause?.statement || hypotheses[0]!.statement,
      status: "cannot_be_assessed",
      statusReason: rainCause?.statusReason || `${noVegetation} Rainfall alone is known.`,
      hypothesisId: hypRainId,
      predictions: [
        {
          key: "p1",
          necessary: true,
          test: {
            kind: "co_movement",
            pairId: "vegetation_rainfall",
            side: null,
            periodIds: [],
            windowMonths: 3,
            seasonId: null,
            flag: null,
            fieldCheckId: null,
            stratumId: null,
            trendSeries: null,
            expected: "same_sign_majority",
          },
          wording:
            rainCause?.prediction ||
            `Seasonal greenness and precipitation move in the same direction across a majority of the 25-year record in ${placeName}.`,
        },
      ],
      scores: [
        {
          predictionKey: "p1",
          outcome: "not_testable",
          dataAdequate: false,
          reasonCode: "value_not_available",
          observed: "Not measured: no vegetation series to compare with rainfall.",
          measurementIds: [measurementIds.rainR2Id, measurementIds.precipTrendId],
          dataBundleIds: [bundleId],
        },
      ],
    }),
    makeBranch({
      id: bGrazingId,
      explanationId: "grazing",
      label: "Grazing",
      statement: grazingCause?.statement || hypotheses[1]!.statement,
      status: "cannot_be_assessed",
      statusReason:
        grazingCause?.statusReason ||
        `Requires local verification of upland grazing and stewardship schedules above ${String(bandLimitM)} m in ${placeName}.`,
      hypothesisId: hypGrazingId,
      predictions: [
        {
          key: "p1",
          necessary: true,
          test: {
            kind: "field_check",
            pairId: null,
            side: null,
            periodIds: [],
            windowMonths: null,
            seasonId: null,
            flag: null,
            fieldCheckId: "herd_records",
            stratumId: null,
            trendSeries: null,
            expected: null,
          },
          wording:
            grazingCause?.prediction ||
            `Upland grazing and stewardship records above ${String(bandLimitM)} m align with the spatial pattern of vegetation change in ${placeName}.`,
        },
      ],
      scores: [
        {
          predictionKey: "p1",
          outcome: "not_testable",
          dataAdequate: false,
          reasonCode: "field_measurement_needed",
          observed: "Only a field measurement can test this.",
          measurementIds: [measurementIds.catchmentTrendId],
          dataBundleIds: [bundleId],
        },
      ],
    }),
    makeBranch({
      id: bLandId,
      explanationId: "land_use",
      label: "Land use",
      statement: landCause?.statement || hypotheses[2]!.statement,
      status: "cannot_be_assessed",
      statusReason:
        landCause?.statusReason ||
        `${noVegetation} Separating valley-floor land use below ${String(bandLimitM)} m from climate also needs local parcel and water records.`,
      hypothesisId: hypLandId,
      predictions: [
        {
          key: "p1",
          necessary: false,
          test: {
            kind: "trend_direction",
            pairId: null,
            side: null,
            periodIds: [],
            windowMonths: null,
            seasonId: null,
            flag: null,
            fieldCheckId: null,
            stratumId: "elevation_low",
            trendSeries: "unadjusted",
            expected: null,
          },
          wording: `Vegetation below ${String(bandLimitM)} m changes differently from the slopes above it (2000 to 2024).`,
        },
        {
          key: "p2",
          necessary: true,
          test: {
            kind: "field_check",
            pairId: null,
            side: null,
            periodIds: [],
            windowMonths: null,
            seasonId: null,
            flag: null,
            fieldCheckId: "orchard_history",
            stratumId: null,
            trendSeries: null,
            expected: null,
          },
          wording:
            landCause?.prediction ||
            `Local parcel, irrigation, or land-cover records below ${String(bandLimitM)} m confirm management changes matching the valley-floor signal.`,
        },
      ],
      scores: [
        {
          predictionKey: "p1",
          outcome: "not_testable",
          dataAdequate: false,
          reasonCode: "no_trend_record",
          observed: `Not measured: no vegetation trend below ${String(bandLimitM)} m.`,
          measurementIds: [measurementIds.bandTrendId, measurementIds.bandLimitId],
          dataBundleIds: [bundleId],
        },
        {
          predictionKey: "p2",
          outcome: "not_testable",
          dataAdequate: false,
          reasonCode: "field_measurement_needed",
          observed: "Only a field measurement can test this.",
          measurementIds: [],
          dataBundleIds: [],
        },
      ],
    }),
    makeBranch({
      id: bSnowId,
      explanationId: "snow_terrain",
      label: "Snow or terrain",
      statement: snowLlmCause?.statement || hypotheses[3]!.statement,
      status: "cannot_be_assessed",
      statusReason:
        snowLlmCause?.statusReason ||
        `Topographic moisture and snowmelt across ${terrain.minElevationM.toFixed(0)}–${terrain.maxElevationM.toFixed(0)} m interact with upland and valley management; field checks are needed to separate them.`,
      hypothesisId: hypSnowId,
      predictions: [
        {
          key: "p1",
          necessary: true,
          test: {
            kind: "field_check",
            pairId: null,
            side: null,
            periodIds: [],
            windowMonths: null,
            seasonId: null,
            flag: null,
            fieldCheckId: "herd_records",
            stratumId: null,
            trendSeries: null,
            expected: null,
          },
          wording:
            snowLlmCause?.prediction ||
            `Upper-band snowmelt and slope moisture transects above ${String(bandLimitM)} m separate terrain buffering from grazing pressure.`,
        },
      ],
      scores: [
        {
          predictionKey: "p1",
          outcome: "not_testable",
          dataAdequate: false,
          reasonCode: "field_measurement_needed",
          observed: "Only a field measurement can test this.",
          measurementIds: [measurementIds.bandLimitId],
          dataBundleIds: [bundleId],
        },
      ],
    }),
    makeBranch({
      id: bArtefactId,
      explanationId: "data_artefact",
      label: "Data artefact",
      statement: artefactLlmCause?.statement || hypotheses[4]!.statement,
      status: "cannot_be_assessed",
      statusReason:
        artefactLlmCause?.statusReason ||
        "Cannot be assessed with current data. Missing: satellite scenes and their quality flags.",
      hypothesisId: hypArtefactId,
      predictions: [
        {
          key: "p1",
          necessary: true,
          test: {
            kind: "quality_flag",
            pairId: "vegetation_rainfall",
            side: "a",
            periodIds: [lastPeriod],
            windowMonths: null,
            seasonId: null,
            flag: "low_scene_count",
            fieldCheckId: null,
            stratumId: null,
            trendSeries: null,
            expected: "present",
          },
          wording:
            artefactLlmCause?.prediction ||
            `Observation record in ${lastPeriod} carries a low_scene_count quality flag.`,
        },
      ],
      scores: [
        {
          predictionKey: "p1",
          outcome: "not_testable",
          dataAdequate: false,
          reasonCode: "no_quality_record",
          observed: `Not measured: no satellite scenes or quality flags are recorded for ${lastPeriod}.`,
          measurementIds: [measurementIds.catchmentTrendId],
          dataBundleIds: [bundleId],
        },
      ],
    }),
  ];

  const branchMerge = BranchMerge.parse({
    recordType: "BranchMerge",
    id: `merge_synth_${slug}_${hash6}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    commandId,
    taskId,
    rulesVersion: "merge@2",
    predictionsCaseRevision: 1,
    branches: explanationBranches.map((b) => ({
      branchId: b.id,
      branchRevision: b.revision,
      explanationId: b.explanationId,
      status:
        b.status === "predicted" ? ("cannot_be_assessed" as const) : b.status,
      reason: b.statusReason,
    })),
    conflicts: [
      {
        testKey: "field_check:herd_records",
        kind: "not_testable",
        detail: "Only a field measurement can test this.",
        predictions: [
          { branchId: bGrazingId, predictionKey: "p1" },
          { branchId: bSnowId, predictionKey: "p1" },
        ],
      },
      {
        testKey: "field_check:orchard_history",
        kind: "not_testable",
        detail: "Only a field measurement can test this.",
        predictions: [{ branchId: bLandId, predictionKey: "p2" }],
      },
    ],
    fieldPlan: {
      measurements: [
        {
          fieldCheckId: "herd_records",
          label: "Upland Stewardship & Grazing Records",
          separates: [
            ["grazing", "land_use"],
            ["grazing", "snow_terrain"],
          ],
          onlySeparates: [["grazing", "snow_terrain"]],
        },
        {
          fieldCheckId: "orchard_history",
          label: "Valley-Floor Land Use & Water History",
          separates: [
            ["grazing", "land_use"],
            ["land_use", "snow_terrain"],
          ],
          onlySeparates: [["land_use", "snow_terrain"]],
        },
      ],
      unseparated: [],
    },
    provenance: {
      ...baseProv([
        "Merged across the 5 competing explanations; none can be assessed until a vegetation series is measured.",
      ]),
      verificationStatus: "unverified",
      inputVersions: explanationBranches.map((b) => ({
        entityId: b.id,
        revision: b.revision,
      })),
    },
  });

  const intStewardId = `int_steward_${slug}_${hash6}`;
  const intLandId = `int_land_${slug}_${hash6}`;
  const intDeferId = `int_defer_${slug}_${hash6}`;

  const intProv: Provenance = {
    ...baseProv([
      "A candidate response, not a recommendation; nothing is decided or authorized.",
      "No benefit, outcome or effect is estimated.",
    ]),
    verificationStatus: "unverified",
  };

  const llmStewardInt =
    llmResult?.interventions.find((i) => i.targetExplanation === "grazing") ??
    llmResult?.interventions[0];
  const llmLandInt =
    llmResult?.interventions.find((i) => i.targetExplanation === "land_use") ??
    llmResult?.interventions[1];
  const llmDeferInt = llmResult?.interventions.find((i) => i.targetExplanation === "defer");

  const interventions: Intervention[] = [
    Intervention.parse({
      recordType: "Intervention",
      id: intStewardId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title:
        llmStewardInt?.title ||
        `Coordinate seasonal upland stewardship above ${String(bandLimitM)} m with local institutions`,
      description:
        llmStewardInt?.description ||
        `If field checks confirm upland grazing or canopy pressure above ${String(bandLimitM)} m in ${placeName}, review seasonal rotation and conservation rules within existing local governance and stewardship frameworks.`,
      status: "candidate",
      assumptions:
        llmStewardInt && llmStewardInt.assumptions.length > 0
          ? llmStewardInt.assumptions
          : [
              `Existing local land managers and stewardship institutions cover the upland zone above ${String(bandLimitM)} m in ${placeName}.`,
            ],
      fieldValidationNeeded:
        llmStewardInt && llmStewardInt.fieldValidationNeeded.length > 0
          ? llmStewardInt.fieldValidationNeeded
          : [
              `Seasonal grazing, land-cover, and stewardship schedules above ${String(bandLimitM)} m.`,
            ],
      livelihoodConsiderations:
        llmStewardInt && llmStewardInt.livelihoodConsiderations.length > 0
          ? llmStewardInt.livelihoodConsiderations
          : [
              "Adjusting seasonal access shifts use across elevation bands; local livelihood costs must be weighed by community reviewers.",
            ],
      ecologicalConsiderations: [
        "No ecological effect of a seasonal adjustment is modeled in this record.",
      ],
      resourceRequirementIds: [],
      requiredReviewRoles: ["community_livelihood", "scientific"],
      evidenceIds: [...new Set([needUpper.id, studyEv.id])],
      hypothesisIds: [hypGrazingId, hypSnowId],
      provenance: intProv,
    }),
    Intervention.parse({
      recordType: "Intervention",
      id: intLandId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title:
        llmLandInt?.title ||
        `Map valley-floor water use and parcel history below ${String(bandLimitM)} m`,
      description:
        llmLandInt?.description ||
        `If landholders and local water authorities share parcel or diversion histories below ${String(bandLimitM)} m, set them beside a measured valley-floor vegetation series before weighing catchment-wide actions.`,
      status: "candidate",
      assumptions:
        llmLandInt && llmLandInt.assumptions.length > 0
          ? llmLandInt.assumptions
          : [
              "Valley-floor parcel, irrigation, or land-cover dates can be verified in local records.",
            ],
      fieldValidationNeeded:
        llmLandInt && llmLandInt.fieldValidationNeeded.length > 0
          ? llmLandInt.fieldValidationNeeded
          : [
              `Parcel management and water diversion dates below ${String(bandLimitM)} m in ${placeName}.`,
            ],
      livelihoodConsiderations:
        llmLandInt && llmLandInt.livelihoodConsiderations.length > 0
          ? llmLandInt.livelihoodConsiderations
          : [
              "Parcel and water records belong to local landholders and jurisdictions; sharing is voluntary.",
            ],
      ecologicalConsiderations: [],
      resourceRequirementIds: [],
      requiredReviewRoles: ["community_livelihood"],
      evidenceIds: [...new Set([needValley.id, contextEv.id])],
      hypothesisIds: [hypLandId],
      provenance: intProv,
    }),
    Intervention.parse({
      recordType: "Intervention",
      id: intDeferId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      title:
        llmDeferInt?.title || "Defer management changes until the two field checks report",
      description:
        llmDeferInt?.description ||
        `Take no management intervention in ${placeName} until a vegetation series is measured and the upland and valley-floor field checks separate the open explanations.`,
      status: "candidate",
      assumptions: [
        "Both field checks can be completed within the next growing season.",
      ],
      fieldValidationNeeded: [],
      livelihoodConsiderations: [],
      ecologicalConsiderations: [],
      resourceRequirementIds: [],
      requiredReviewRoles: ["program_coordination"],
      evidenceIds: [needUpper.id, needValley.id],
      hypothesisIds: [],
      provenance: intProv,
    }),
  ];

  const makeRes = (
    suffix: string,
    label: string,
    resourceKind: ResourceRequirement["resourceKind"],
  ): ResourceRequirement =>
    ResourceRequirement.parse({
      recordType: "ResourceRequirement",
      id: `res_${suffix}_${slug}_${hash6}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      label,
      resourceKind,
      quantity: null,
      unit: null,
      estimateStatus: "unknown",
      assumptions: [],
      verificationNeeded: ["Unknown, to be established locally."],
      provenance: intProv,
    });

  const resourceRequirements: ResourceRequirement[] = [
    makeRes("team", `Local field team for upland and valley-floor surveys in ${placeName}`, "expertise"),
    makeRes("guide", `Regional steward or watershed specialist familiar with ${placeName}`, "local_information"),
    makeRes("season", "One growing season of field observation and interviews", "time"),
    makeRes("gps", "GNSS / GPS units and dated satellite reference maps", "equipment"),
    makeRes("perm", `Permission of local landholders and governing authorities in ${regionName}`, "permission"),
  ];

  const reviewDecisions: ReviewDecision[] = (
    ["community_livelihood", "scientific"] as const
  ).map((role) =>
    ReviewDecision.parse({
      recordType: "ReviewDecision",
      id: `rev_${role}_${slug}_${hash6}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      actionId,
      reviewedEntityVersions: [
        { entityId: actionId, revision: 1 },
        { entityId: briefId, revision: 1 },
      ],
      caseRevisionReviewed: 1,
      role,
      actorId: null,
      authorityStatus: "not_established",
      mode: "demo",
      status: "requested",
      decisionAt: null,
      conditions: [],
      comments: "Review requested. The request grants nothing.",
      stale: false,
    }),
  );

  const permissions = [
    `Agreement of local land managers and governing authorities in ${placeName} before any upland survey above ${String(bandLimitM)} m.`,
    `Agreement of valley-floor landholders in ${placeName} before recording parcel or water history.`,
  ];
  const consultationSteps = [
    `Initial consultation with local watershed stewards and community representatives in ${placeName} (${regionName}).`,
  ];

  const operationalAction = OperationalAction.parse({
    recordType: "OperationalAction",
    id: actionId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    title: `Field check of upland stewardship and valley-floor land use in ${placeName}`,
    description: `Draft field validation plan to separate upland management, valley-floor land use, and topographic moisture across ${placeName}.`,
    kind: "field_validation_plan",
    status: "awaiting_review",
    evidenceIds: [needUpper.id, needValley.id, climateEv.id],
    interventionIds: interventions.map((i) => i.id),
    dependsOnActionIds: [],
    resourceRequirementIds: resourceRequirements.map((r) => r.id),
    requiredReviewRoles: ["community_livelihood", "scientific"],
    reviewDecisionIds: reviewDecisions.map((r) => r.id),
    authorizationMode: "demo_only",
    externalExecutionEnabled: false,
    remainingConditions: [
      ...permissions,
      ...consultationSteps,
      "Local authority and representation are not established; nothing is sent, scheduled or authorized.",
    ],
    preparedArtifactUri: null,
    sourceCaseRevision: 1,
    fieldPlan: {
      objective: `Separate upland stewardship, valley-floor land use, and relief moisture across ${placeName} (${terrain.minElevationM.toFixed(0)}–${terrain.maxElevationM.toFixed(0)} m).`,
      decisionInformed:
        "Which candidate response local reviewers weigh, or whether to defer intervention.",
      strata: [
        {
          key: "elevation_high",
          label: "Upland elevation band",
          definition: `Upper watershed slopes and ridges at ${String(bandLimitM)} m to ${terrain.maxElevationM.toFixed(0)} m.`,
          dataBundleId: bundleId,
        },
        {
          key: "valley_bottom_fields",
          label: "Valley floor and lower basin",
          definition: `Lower catchment corridor from ${terrain.minElevationM.toFixed(0)} m to ${String(bandLimitM)} m.`,
          dataBundleId: bundleId,
        },
      ],
      measurements: [
        {
          what: (
            grazingCause?.fieldCheck.what ||
            `Upland grazing, canopy, and stewardship schedules above ${String(bandLimitM)} m`
          ).slice(0, 290),
          method: (
            grazingCause?.fieldCheck.method ||
            "Structured interviews with local stewards and transect checks across upper elevation bands"
          ).slice(0, 390),
          season: (
            grazingCause?.fieldCheck.seasonWindow || "Primary growing season"
          ).slice(0, 110),
          stratumKeys: ["elevation_high"],
          fieldRole: "Local field team with regional guide",
          resolvesGapIds: [needUpper.id],
          discriminatesHypothesisIds: [hypGrazingId, hypSnowId],
          fieldCheckId: "herd_records",
        },
        {
          what: (
            landCause?.fieldCheck.what ||
            `Valley-floor parcel, irrigation, and land-use history below ${String(bandLimitM)} m`
          ).slice(0, 290),
          method: (
            landCause?.fieldCheck.method ||
            "Landholder and water-manager consultations, later set beside a measured vegetation series"
          ).slice(0, 390),
          season: (landCause?.fieldCheck.seasonWindow || "Any season").slice(0, 110),
          stratumKeys: ["valley_bottom_fields"],
          fieldRole: "Local field team",
          resolvesGapIds: [needValley.id],
          discriminatesHypothesisIds: [hypLandId, hypSnowId],
          fieldCheckId: "orchard_history",
        },
      ],
      deferredGaps: [],
      permissions,
      consultationSteps,
    },
  });

  const line = (
    text: string,
    claimKind: BriefItem["claimKind"],
    cites: readonly Evidence[],
  ): BriefItem => ({
    text: text.slice(0, 395),
    claimKind,
    evidenceIds: cites.map((e) => e.id),
    measurementIds: [...new Set(cites.flatMap((e) => e.measurementIds))],
  });

  const knownLines: BriefItem[] = [
    ...(llmResult?.briefSummary
      ? [
          line(
            llmResult.briefSummary,
            "scientific_context",
            llmVerifiedEvidence.length > 0 ? llmVerifiedEvidence : [studyEv],
          ),
        ]
      : []),
    line(climateEv.statement, climateEv.claimKind, [climateEv]),
    line(studyEv.statement, "scientific_context", [studyEv]),
    ...(contextEv.id !== studyEv.id
      ? [line(contextEv.statement, contextEv.claimKind, [contextEv])]
      : []),
    ...llmVerifiedEvidence.map((ev) => line(ev.statement, "scientific_context", [ev])),
  ];

  const brief = Brief.parse({
    recordType: "Brief",
    id: briefId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    title: operationalAction.title,
    status: "ready_for_review",
    sourceCaseRevision: 1,
    evidenceIds: [
      ...new Set([
        climateEv.id,
        studyEv.id,
        contextEv.id,
        needUpper.id,
        needValley.id,
        ...llmVerifiedEvidence.map((e) => e.id),
      ]),
    ],
    hypothesisIds: [hypRainId, hypGrazingId, hypLandId, hypSnowId],
    interventionIds: interventions.map((i) => i.id),
    actionIds: [operationalAction.id],
    known: knownLines,
    uncertain: [
      line(
        `Whether vegetation in ${placeName} has changed since 2000 is not measured; if it has, separating rainfall, upland management, valley-floor land use and topographic moisture needs that series and field checks.`,
        "hypothesis",
        [needUpper],
      ),
      line(needValley.statement, "field_requirement", [needValley]),
    ],
    nextMeasurements: [
      line(
        `A satellite vegetation series (NDVI, 2000 to 2024) across ${placeName}, to say whether vegetation changed at all.`,
        "field_requirement",
        [climateEv],
      ),
      line(
        `Upland stewardship and grazing schedules above ${String(bandLimitM)} m, to separate upland management from terrain moisture.`,
        "field_requirement",
        [needUpper],
      ),
      line(
        `Valley-floor parcel and water history below ${String(bandLimitM)} m, to separate land-use change from climate trends.`,
        "field_requirement",
        [needValley],
      ),
    ],
    stakeholderRoles: [
      line(
        `Community and livelihood reviewers in ${placeName}, for local land-use and stewardship records.`,
        "field_requirement",
        [needUpper, needValley],
      ),
      line(
        "Scientific reviewers, for watershed stratification and field validation protocol.",
        "field_requirement",
        [needUpper],
      ),
    ],
    preparedActions: [
      line(
        `A draft field validation plan stratified at ${String(bandLimitM)} m across ${placeName}.`,
        "field_requirement",
        [needUpper, needValley],
      ),
      line(
        "Five resource requirements for the field checks, quantities to be established locally.",
        "field_requirement",
        [needUpper],
      ),
      line(
        "Three candidate responses with stated assumptions, none ranked or authorized.",
        "field_requirement",
        [needUpper, needValley],
      ),
    ],
    authorizationRequired: [
      line(permissions[0]!, "field_requirement", [needUpper]),
      line(permissions[1]!, "field_requirement", [needValley]),
      line(
        "Any field work at all: Siterra's role ends at this draft.",
        "field_requirement",
        [needUpper],
      ),
    ],
    nextSteps: [
      line(
        "A reviewer inspects the competing explanations and decides whether the field checks proceed.",
        "field_requirement",
        [needUpper],
      ),
    ],
    reviewDecisionIds: reviewDecisions.map((r) => r.id),
    limitations: [
      "Built from the Open-Meteo rainfall series (ERA5 reanalysis), the terrain elevation grid and indexed literature. No vegetation series is measured; field checks are required before any intervention.",
      "Draft prepared by Siterra; nothing is sent, scheduled or authorized.",
    ],
    mode: llmResult ? "live" : "replay",
    provenance: {
      ...intProv,
      // the brief cites every evidence, hypothesis and intervention it names, at its revision, so it
      // goes stale when any of them changes (commit.ts uncoveredBriefCitations)
      inputVersions: [
        ...new Map(
          [
            climateEv,
            studyEv,
            contextEv,
            needUpper,
            needValley,
            ...llmVerifiedEvidence,
            ...hypotheses.filter((h) => h.id !== hypArtefactId),
            ...interventions,
          ].map((r) => [r.id, { entityId: r.id, revision: r.revision }] as const),
        ).values(),
      ],
    },
  });

  const task = Task.parse({
    recordType: "Task",
    id: taskId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    caseId,
    commandId,
    kind: "brief_package",
    question,
    status: "awaiting_review",
    dependsOnTaskIds: [],
    inputVersions: [],
    allowedTools: ["read_case", "read_evidence", "propose_package", "request_review"],
    outputEntityIds: [operationalAction.id, brief.id],
    idempotencyKey: `synth-brief-${slug}-${hash6}`,
    attempt: 0,
    maxModelRounds: 3,
    deadlineAt: now,
    budgetMicroUsd: 0,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: now,
    finishedAt: now,
  });

  return {
    commandId,
    task,
    fieldRequirementEvidence: [needUpper, needValley, ...llmVerifiedEvidence],
    hypotheses,
    explanationBranches,
    branchMerge,
    interventions,
    resourceRequirements,
    reviewDecisions,
    operationalAction,
    brief,
  };
}

export const synthesizeLiveCaseSnapshot = synthesizeCasePackage;
