import type { ToolName } from "../tools/tool.ts";
import type { TraceEventDraft } from "./trace.ts";

// Record shapes this package writes, mirroring case.schema.json 1.2 until packages/contracts
// exports the Zod types. Field names and enums match the schema exactly.

export interface EntityVersion {
  entityId: string;
  revision: number;
}

export type TaskKind =
  | "plan"
  | "source_research"
  | "observation_analysis"
  | "livelihood_governance"
  | "hypothesis_comparison"
  | "intervention_feasibility"
  | "brief_package"
  | "validation";

export type TaskStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "awaiting_review"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export interface TaskRecord {
  recordType: "Task";
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  caseId: string;
  commandId: string;
  kind: TaskKind;
  question: string;
  status: TaskStatus;
  dependsOnTaskIds: string[];
  inputVersions: EntityVersion[];
  allowedTools: ToolName[];
  outputEntityIds: string[];
  idempotencyKey: string;
  attempt: number;
  maxModelRounds: number;
  deadlineAt: string;
  budgetMicroUsd: number;
  spentMicroUsd: number;
  checkpointId: string | null;
  failureCode: string | null;
  missingInputs: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SourceLocator {
  sourceId: string;
  locator: string;
  excerpt: string | null;
}

export interface Provenance {
  sourceLocators: SourceLocator[];
  dataBundleIds: string[];
  methodId: string | null;
  methodVersion: string | null;
  inputVersions: EntityVersion[];
  generatedByTaskId: string | null;
  generatedAt: string;
  verificationStatus: "unverified" | "source_checked" | "computed_checked" | "expert_reviewed";
  limitations: string[];
}

export interface Uncertainty {
  kind: "not_quantified" | "spatial_iqr" | "interval" | "standard_error";
  lower: number | null;
  upper: number | null;
  level: number | null;
  method: string | null;
}

export interface DataBundleRecord {
  recordType: "DataBundle";
  id: string;
  revision: number;
  caseId: string;
  label: string;
  status: "missing" | "processing" | "validated" | "failed" | "superseded";
  datasetId: string;
  datasetVersion: string | null;
  sourceIds: string[];
  geoSelectionId: string;
  geoRevision: number;
  periodIds: string[];
  methodId: string;
  methodVersion: string;
  manifestUri: string | null;
  contentHash: string | null;
  license: string | null;
  attribution: string | null;
  provenance: Provenance;
}

export interface MeasurementRecord {
  recordType: "Measurement";
  id: string;
  revision: number;
  caseId: string;
  metric: string;
  value: number | null;
  unit: string;
  status: "available" | "missing" | "excluded" | "invalid";
  missingReason: string | null;
  geoSelectionId: string;
  geoRevision: number;
  periodId: string;
  dataBundleId: string;
  aggregation: string;
  validPixelCount: number | null;
  totalPixelCount: number | null;
  validFraction: number | null;
  spatialResolutionM: number | null;
  uncertainty: Uncertainty;
  provenance: Provenance;
}

export type ClaimKind =
  | "observation"
  | "scientific_context"
  | "hypothesis"
  | "model_estimate"
  | "scenario"
  | "field_requirement"
  | "verified_outcome";

export interface EvidenceRecord {
  recordType: "Evidence";
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  caseId: string;
  statement: string;
  claimKind: ClaimKind;
  status: "provisional" | "accepted" | "rejected" | "stale" | "superseded";
  geoSelectionId: string | null;
  periodIds: string[];
  measurementIds: string[];
  provenance: Provenance;
  interpretation: string | null;
  uncertainty: string;
  reviewDecisionIds: string[];
}

/**
 * What a task hands to the commit API: upserts and events applied in one transaction against
 * `expectedCaseRevision`. The commit API assigns event IDs, sequences and the new revision.
 */
export interface CommitDraft {
  caseId: string;
  commandId: string;
  taskId: string;
  expectedCaseRevision: number;
  idempotencyKey: string;
  inputVersions: EntityVersion[];
  upserts: (TaskRecord | EvidenceRecord)[];
  events: TraceEventDraft[];
}
