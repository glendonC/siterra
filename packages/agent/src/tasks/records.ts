import type {
  DataBundle,
  EntityVersion as ContractEntityVersion,
  Evidence,
  Hypothesis,
  Measurement,
  Provenance as ContractProvenance,
  SourceLocator as ContractSourceLocator,
  Relationship,
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
export type RelationshipRecord = Relationship;

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
  upserts: (TaskRecord | EvidenceRecord | HypothesisRecord | RelationshipRecord)[];
  events: TraceEventDraft[];
}
