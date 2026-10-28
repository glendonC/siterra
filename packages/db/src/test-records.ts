// Test support: synthetic records with the example slug (never demo data; SA-09).
import type { CommandRequest, EnvironmentalCase, Evidence } from "@siterra/contracts";
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
