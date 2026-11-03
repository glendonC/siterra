import {
  BranchMerge,
  type Evidence,
  ExplanationBranch,
  type Hypothesis,
  type Provenance,
} from "@siterra/contracts";
import { buildHypothesesAndEvidence } from "./case-hypotheses-builder.ts";
import type { SynthesizeCasePackageInput } from "./case-synthesizer.ts";
import type { LlmCauseDraft } from "./llm-reasoner.ts";

export interface SynthModelMetadata {
  model: string;
  promptVersion: string;
  loopStatus: "accepted";
  validationOutcome: "accepted";
  failureCode: null;
  repaired: false;
}

export interface BuiltExplanationTree {
  studyEv: Evidence;
  contextEv: Evidence;
  climateEv: Evidence;
  needUpper: Evidence;
  needValley: Evidence;
  llmVerifiedEvidence: Evidence[];
  hypotheses: Hypothesis[];
  explanationBranches: ExplanationBranch[];
  branchMerge: BranchMerge;
  hypIds: {
    hypRainId: string;
    hypGrazingId: string;
    hypLandId: string;
    hypSnowId: string;
    hypArtefactId: string;
  };
  grazingCause: LlmCauseDraft | undefined;
  landCause: LlmCauseDraft | undefined;
}

/**
 * Builds the field-requirement evidence, the 5 competing Hypotheses, the 5 ExplanationBranches,
 * and the BranchMerge record for a live place.
 */
export function buildExplanationTree(
  input: SynthesizeCasePackageInput,
  ctx: {
    commandId: string;
    taskId: string;
    activeModel: SynthModelMetadata;
    baseProv: (limitations: string[]) => Provenance;
  },
): BuiltExplanationTree {
  const {
    caseId,
    slug,
    hash6,
    placeName,
    now,
    bundleId,
    periodIds,
    bandLimitM,
    terrain,
    measurementIds,
  } = input;
  const { commandId, taskId, activeModel, baseProv } = ctx;

  const builtHyps = buildHypothesesAndEvidence(input, { taskId, baseProv });
  const {
    studyEv,
    contextEv,
    climateEv,
    needUpper,
    needValley,
    llmVerifiedEvidence,
    hypotheses,
    noVegetation,
    hypIds,
    llmCauseByExp,
  } = builtHyps;
  const { hypRainId, hypGrazingId, hypLandId, hypSnowId, hypArtefactId } = hypIds;

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
  const snowLlmCause = llmCauseByExp.get("snow_terrain");
  const artefactLlmCause = llmCauseByExp.get("data_artefact");

  const explanationBranches: ExplanationBranch[] = [
    makeBranch({
      id: bRainId,
      explanationId: "rainfall",
      label: "Rainfall",
      statement: rainCause?.statement || (hypotheses[0]?.statement ?? ""),
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
      statement: grazingCause?.statement || (hypotheses[1]?.statement ?? ""),
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
      statement: landCause?.statement || (hypotheses[2]?.statement ?? ""),
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
      statement: snowLlmCause?.statement || (hypotheses[3]?.statement ?? ""),
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
      statement: artefactLlmCause?.statement || (hypotheses[4]?.statement ?? ""),
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

  return {
    studyEv,
    contextEv,
    climateEv,
    needUpper,
    needValley,
    llmVerifiedEvidence,
    hypotheses,
    explanationBranches,
    branchMerge,
    hypIds,
    grazingCause,
    landCause,
  };
}
