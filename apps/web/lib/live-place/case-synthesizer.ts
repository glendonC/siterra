import type {
  BranchMerge,
  Brief,
  Evidence,
  ExplanationBranch,
  Hypothesis,
  Intervention,
  OperationalAction,
  Provenance,
  ResourceRequirement,
  ReviewDecision,
  Source,
  Task,
} from "@siterra/contracts";
import { buildDecisionPackage } from "./case-decision-builder.ts";
import { type SynthModelMetadata, buildExplanationTree } from "./case-explanation-builder.ts";
import type { HistoricalClimateSummary } from "./climate-series.ts";
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

const SYNTH_MODEL: SynthModelMetadata = {
  model: "siterra-watershed-synthesizer-1",
  promptVersion: "synth@1",
  loopStatus: "accepted",
  validationOutcome: "accepted",
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
  const { slug, hash6, now, bundleId, llmResult } = input;

  const commandId = `cmd_synth_${slug}_${hash6}`;
  const taskId = `task_synth_${slug}_${hash6}`;
  const actionId = `act_field_${slug}_${hash6}`;
  const briefId = `brief_synth_${slug}_${hash6}`;

  const activeModel: SynthModelMetadata = llmResult
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

  const exp = buildExplanationTree(input, {
    commandId,
    taskId,
    activeModel,
    baseProv,
  });

  const dec = buildDecisionPackage(input, exp, {
    commandId,
    taskId,
    actionId,
    briefId,
    baseProv,
  });

  return {
    commandId,
    task: dec.task,
    fieldRequirementEvidence: [exp.needUpper, exp.needValley, ...exp.llmVerifiedEvidence],
    hypotheses: exp.hypotheses,
    explanationBranches: exp.explanationBranches,
    branchMerge: exp.branchMerge,
    interventions: dec.interventions,
    resourceRequirements: dec.resourceRequirements,
    reviewDecisions: dec.reviewDecisions,
    operationalAction: dec.operationalAction,
    brief: dec.brief,
  };
}

export const synthesizeLiveCaseSnapshot = synthesizeCasePackage;
