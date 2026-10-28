import type {
  Brief,
  BranchMerge,
  DataBundle,
  ExplanationBranch,
  EntityVersion as ContractEntityVersion,
  Evidence,
  EventRecordRow,
  Hypothesis,
  Intervention,
  Measurement,
  OperationalAction,
  Provenance as ContractProvenance,
  SourceLocator as ContractSourceLocator,
  Relationship,
  ResourceRequirement,
  ReviewDecision,
  Task,
  Uncertainty as ContractUncertainty,
} from "@siterra/contracts";

import type { TraceEventDraft } from "./trace.ts";

// The records this package writes are the types of packages/contracts (case schema 1.4.0).

export type EntityVersion = ContractEntityVersion;
export type TaskKind = Task["kind"];
export type TaskStatus = Task["status"];
export type TaskRecord = Task;
export type SourceLocator = ContractSourceLocator;
export type Provenance = ContractProvenance;
export type Uncertainty = ContractUncertainty;
export type DataBundleRecord = DataBundle;
export type MeasurementRecord = Measurement;
export type ClaimKind = Evidence["claimKind"];
export type EvidenceRecord = Evidence;
export type HypothesisRecord = Hypothesis;
export type InterventionRecord = Intervention;
export type OperationalActionRecord = OperationalAction;
export type BriefRecord = Brief;
export type ReviewDecisionRecord = ReviewDecision;
export type ResourceRequirementRecord = ResourceRequirement;
export type EventRecordRowRecord = EventRecordRow;
export type RelationshipRecord = Relationship;
export type ExplanationBranchRecord = ExplanationBranch;
export type BranchMergeRecord = BranchMerge;

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
  upserts: (
    | TaskRecord
    | EvidenceRecord
    | HypothesisRecord
    | InterventionRecord
    | OperationalActionRecord
    | BriefRecord
    | ReviewDecisionRecord
    | ResourceRequirementRecord
    | RelationshipRecord
    | ExplanationBranchRecord
    | BranchMergeRecord
  )[];
  events: TraceEventDraft[];
}
