import { createHash } from "node:crypto";

import type { CommitDraft, CommitOutcome, EventDraftRecord } from "@siterra/agent";
import type { Command, EnvironmentalCase } from "@siterra/contracts";
import { caseSchemaVersion } from "@siterra/contracts";
import {
  appendEvents,
  applyCommit,
  isCancelRequested,
  readSnapshot,
  setCommandStatus,
} from "@siterra/db";
import type { CommitProposal, Pool } from "@siterra/db";
import { newId } from "@siterra/domain";

import type { CommandView, WorkerDb, WorkerSnapshot } from "./plan-job.ts";

// WorkerDb over PLATFORM's packages/db. The worker owns no SQL of its own except two reads the
// package does not export: a command by ID and a case's owner scope (readSnapshot needs it).
// applyCommit needs the whole Commit: the worker fills the commit ID, the new revision and
// caseAfter (the stored case with a new updatedAt, so a rebase keeps the case fields unchanged).

type EventInput = CommitProposal["events"][number];

function eventDraft(draft: EventDraftRecord): EventInput {
  return { ...draft };
}

/** A dedupeKey for a commit's own events: the commit key and the event's position in it. */
function commitEventKey(idempotencyKey: string, index: number): string {
  const digest = createHash("sha256")
    .update(`${idempotencyKey}\u0000${String(index)}`)
    .digest("hex");
  return `evt-${digest.slice(0, 32)}`;
}

export function workerDb(pool: Pool, now: () => Date = () => new Date()): WorkerDb {
  const ownerOf = async (caseId: string): Promise<string | null> => {
    const result = await pool.query<{ owner_scope_id: string }>(
      "select owner_scope_id from cases where id = $1",
      [caseId],
    );
    return result.rows[0]?.owner_scope_id ?? null;
  };
  const caseRecord = async (caseId: string): Promise<EnvironmentalCase | null> => {
    const result = await pool.query<{ record: EnvironmentalCase }>(
      "select record from cases where id = $1",
      [caseId],
    );
    return result.rows[0]?.record ?? null;
  };

  return {
    async readCommand(commandId) {
      const result = await pool.query<{ record: Command }>(
        "select record from commands where id = $1",
        [commandId],
      );
      const command = result.rows[0]?.record;
      if (!command) return null;
      const view: CommandView = {
        id: command.id,
        caseId: command.caseId,
        text: command.text,
        intent: command.intent,
        status: command.status,
        context: command.context,
      };
      return view;
    },

    async readSnapshot(caseId) {
      const owner = await ownerOf(caseId);
      if (owner === null) return null;
      const snapshot = await readSnapshot(pool, caseId, owner);
      if (!snapshot) return null;
      const c = snapshot.case;
      const view: WorkerSnapshot = {
        case: {
          id: c.id,
          revision: c.revision,
          title: c.title,
          objective: c.objective,
          mode: c.mode,
          activeGeoSelectionId: c.activeGeoSelectionId,
          unresolvedQuestions: c.unresolvedQuestions,
        },
        records: {
          dataBundleRecords: snapshot.records.dataBundleRecords,
          measurementRecords: snapshot.records.measurementRecords,
          temporalObservationRecords: snapshot.records.temporalObservationRecords,
          sourceRecords: snapshot.records.sourceRecords,
          geoSelectionRecords: snapshot.records.geoSelectionRecords.map((g) => ({
            id: g.id,
            revision: g.revision,
            label: g.label,
          })),
          evidenceRecords: snapshot.records.evidenceRecords,
          taskRecords: snapshot.records.taskRecords,
        },
      };
      return view;
    },

    async commit(draft: CommitDraft): Promise<CommitOutcome> {
      const stored = await caseRecord(draft.caseId);
      if (!stored) throw new Error(`case ${draft.caseId} not found`);
      const at = now().toISOString();
      const proposal = {
        recordType: "Commit",
        schemaVersion: caseSchemaVersion,
        id: newId("commit"),
        caseId: draft.caseId,
        commandId: draft.commandId,
        taskId: draft.taskId,
        expectedCaseRevision: draft.expectedCaseRevision,
        newCaseRevision: draft.expectedCaseRevision + 1,
        idempotencyKey: draft.idempotencyKey,
        inputVersions: draft.inputVersions,
        caseAfter: { ...stored, revision: draft.expectedCaseRevision + 1, updatedAt: at },
        upserts: draft.upserts,
        layoutActions: [],
        events: draft.events.map((e, i) =>
          eventDraft({
            ...e,
            commandId: draft.commandId,
            dedupeKey: commitEventKey(draft.idempotencyKey, i),
            spanId: null,
            parentSpanId: null,
          }),
        ),
        resultKey: null,
      } satisfies CommitProposal;
      const outcome = await applyCommit(pool, proposal);
      switch (outcome.status) {
        case "committed":
          return {
            status: "committed",
            newCaseRevision: outcome.commit.newCaseRevision,
            entityIds: outcome.commit.upserts.map((u) => u.id),
          };
        case "duplicate":
          return { status: "duplicate", newCaseRevision: outcome.newCaseRevision, entityIds: [] };
        case "stale":
          return { status: "stale", currentCaseRevision: outcome.currentRevision };
        case "not_found":
          throw new Error(`case ${draft.caseId} not found`);
      }
    },

    async appendEvents(caseId, drafts) {
      await appendEvents(pool, caseId, drafts.map(eventDraft));
    },

    async setCommandStatus(commandId, status, taskIds) {
      await setCommandStatus(pool, commandId, status, taskIds);
    },

    isCancelRequested(commandId) {
      return isCancelRequested(pool, commandId);
    },
  };
}
