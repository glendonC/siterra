// Test support: synthetic records with the example slug (never demo data; SA-09).
import type {
  BranchMerge,
  CommandRequest,
  EnvironmentalCase,
  Evidence,
  ExplanationBranch,
} from "@siterra/contracts";
import type { EventDraft } from "./events.ts";
import type { CommitProposal } from "./commit.ts";

export const at = "2026-10-27T20:00:00Z";

export function exampleCase(id = "case_example_platform", revision = 1): EnvironmentalCase {
  return {
    recordType: "EnvironmentalCase",
    id,
    revision,
    createdAt: at,
    updatedAt: at,
    title: "Example: platform test case",
    objective: "Synthetic case for storage tests.",
    status: "commissioned",
    mode: "concept",
    ownerScopeId: "owner_example",
    activeGeoSelectionId: null,
    currentBriefId: null,
    unresolvedQuestions: [],
    permissionProfile: "research_and_preparation_only",
    description: "Synthetic test fixture. No result is asserted.",
  };
}

export function exampleEvidence(caseId: string, id: string, revision = 1): Evidence {
  return {
    recordType: "Evidence",
    id,
    revision,
    createdAt: at,
    updatedAt: at,
    caseId,
    statement: `Synthetic statement ${id} revision ${revision}.`,
    claimKind: "field_requirement",
    status: "provisional",
    geoSelectionId: null,
    periodIds: [],
    measurementIds: [],
    provenance: {
      sourceLocators: [],
      dataBundleIds: [],
      methodId: null,
      methodVersion: null,
      inputVersions: [],
      generatedByTaskId: null,
      generatedAt: at,
      verificationStatus: "unverified",
      limitations: [],
    },
    interpretation: null,
    uncertainty: "Synthetic.",
    reviewDecisionIds: [],
  };
}

const noProvenance = (inputVersions: Evidence["provenance"]["inputVersions"] = []) => ({
  sourceLocators: [],
  dataBundleIds: [],
  methodId: null,
  methodVersion: null,
  inputVersions,
  generatedByTaskId: null,
  generatedAt: at,
  verificationStatus: "unverified" as const,
  limitations: [],
});

/** A branch as predicted (revision 1) or as scored (revision 2). */
export function exampleBranch(caseId: string, id: string, revision: 1 | 2): ExplanationBranch {
  return {
    recordType: "ExplanationBranch",
    id,
    revision,
    createdAt: at,
    updatedAt: at,
    caseId,
    commandId: "cmd_example_platform",
    taskId: "task_example_platform",
    explanationId: "rainfall",
    label: "Rainfall",
    statement: "Synthetic explanation.",
    status: revision === 1 ? "predicted" : "cannot_be_assessed",
    statusReason:
      revision === 1 ? "Predictions recorded; not scored yet." : "No prediction is testable.",
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
          fieldCheckId: "example_check",
          stratumId: null,
          trendSeries: null,
          expected: null,
        },
        wording: "Synthetic prediction.",
      },
    ],
    predictedAt: at,
    predictionsCaseRevision: revision === 1 ? null : 2,
    scores:
      revision === 1
        ? []
        : [
            {
              predictionKey: "p1",
              outcome: "not_testable",
              dataAdequate: false,
              reasonCode: "field_measurement_needed",
              observed: "Only a field measurement can test this.",
              measurementIds: [],
              dataBundleIds: [],
            },
          ],
    scoredAt: revision === 1 ? null : at,
    model: {
      model: "example-model",
      promptVersion: "explanation_branches@1",
      loopStatus: "accepted",
      validationOutcome: "accepted",
      failureCode: null,
      repaired: false,
    },
    hypothesisId: null,
    provenance: noProvenance(),
  };
}

export function exampleMerge(caseId: string, id: string, branchId: string): BranchMerge {
  return {
    recordType: "BranchMerge",
    id,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    caseId,
    commandId: "cmd_example_platform",
    taskId: "task_example_platform",
    rulesVersion: "merge@1",
    predictionsCaseRevision: 2,
    branches: [
      {
        branchId,
        branchRevision: 2,
        explanationId: "rainfall",
        status: "cannot_be_assessed",
        reason: "No prediction is testable.",
      },
    ],
    conflicts: [],
    provenance: noProvenance([{ entityId: branchId, revision: 2 }]),
  };
}

export function exampleEvent(
  dedupeKey: string,
  kind: EventDraft["kind"] = "task.progress",
): EventDraft {
  return {
    occurredAt: at,
    kind,
    commandId: null,
    taskId: null,
    entityIds: [],
    message: "Synthetic event",
    dedupeKey,
    resultStatus: null,
    tool: null,
    usage: null,
    validation: null,
    spanId: null,
    parentSpanId: null,
  };
}

export function exampleCommit(
  caseRecord: EnvironmentalCase,
  args: {
    id: string;
    expected: number;
    upserts: CommitProposal["upserts"];
    inputVersions?: CommitProposal["inputVersions"];
    resultKey?: string | null;
    idempotencyKey?: string;
  },
): CommitProposal {
  return {
    recordType: "Commit",
    schemaVersion: "1.3.0",
    id: args.id,
    caseId: caseRecord.id,
    commandId: "cmd_example_platform",
    taskId: "task_example_platform",
    expectedCaseRevision: args.expected,
    newCaseRevision: args.expected + 1,
    idempotencyKey: args.idempotencyKey ?? `key-${args.id}`,
    resultKey: args.resultKey ?? null,
    inputVersions: args.inputVersions ?? [],
    caseAfter: { ...caseRecord, revision: args.expected + 1 },
    upserts: args.upserts,
    events: [exampleEvent(`committed-${args.id}`, "case.committed")],
    layoutActions: [],
  };
}

export function exampleCommandRequest(key: string, text = "Synthetic request"): CommandRequest {
  return {
    text,
    intent: "commission",
    context: {
      caseRevision: 1,
      geoSelectionId: null,
      geoRevision: null,
      periodIds: [],
      focusedEntityIds: [],
      dataBundleIds: [],
      locale: "en",
    },
    expectedCaseRevision: 1,
    idempotencyKey: key,
  };
}
