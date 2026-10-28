import type { CommitDraft, EvidenceRecord, TaskRecord } from "./records.ts";

// The commit boundary the worker calls (docs/reference/data-contracts.md#idempotency-revisions-and-recovery).
// PLATFORM's commit transaction implements it over PostgreSQL; MemoryCommitApi is the test double
// that applies the same rules: expected revision, idempotency key, all or nothing.

export type CommitOutcome =
  | { status: "committed"; newCaseRevision: number; entityIds: string[] }
  | { status: "duplicate"; newCaseRevision: number; entityIds: string[] }
  | { status: "stale"; currentCaseRevision: number };

export interface CommitApi {
  commit(draft: CommitDraft): Promise<CommitOutcome>;
}

export class MemoryCommitApi implements CommitApi {
  caseRevision: number;
  readonly tasks = new Map<string, TaskRecord>();
  readonly evidence = new Map<string, EvidenceRecord>();
  readonly events: (CommitDraft["events"][number] & { sequence: number; caseRevision: number })[] =
    [];
  readonly #applied = new Map<string, { newCaseRevision: number; entityIds: string[] }>();

  constructor(caseRevision: number) {
    this.caseRevision = caseRevision;
  }

  commit(draft: CommitDraft): Promise<CommitOutcome> {
    const seen = this.#applied.get(draft.idempotencyKey);
    if (seen) return Promise.resolve({ status: "duplicate", ...seen });
    if (draft.expectedCaseRevision !== this.caseRevision) {
      return Promise.resolve({ status: "stale", currentCaseRevision: this.caseRevision });
    }
    this.caseRevision += 1;
    const entityIds: string[] = [];
    for (const record of draft.upserts) {
      if (record.recordType === "Task") this.tasks.set(record.id, record);
      else this.evidence.set(record.id, record);
      entityIds.push(record.id);
    }
    for (const event of draft.events) {
      this.events.push({
        ...event,
        sequence: this.events.length + 1,
        caseRevision: this.caseRevision,
      });
    }
    const result = { newCaseRevision: this.caseRevision, entityIds };
    this.#applied.set(draft.idempotencyKey, result);
    return Promise.resolve({ status: "committed", ...result });
  }
}
