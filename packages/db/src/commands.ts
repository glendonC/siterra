import { Command, type CommandRequest, caseSchemaVersion } from "@siterra/contracts";
import { canonicalJson, eventMessages, newId, sha256Hex } from "@siterra/domain";
import { type Pool, inTransaction, lockCase, notifyEvents } from "./client.ts";
import { insertEvents, setLastSequence } from "./events.ts";
import { type InstanceSpendPolicy, spendAllows } from "./instance-spend.ts";

export type SubmitOutcome =
  | { status: "created"; command: Command }
  | { status: "existing"; command: Command }
  | { status: "key_reused" }
  | { status: "quota_exhausted" }
  /** The instance's cap on live model spend would be passed by one more command. */
  | { status: "budget_exhausted" }
  | { status: "revision_ahead"; currentRevision: number }
  | { status: "not_found" };

/** Queue name and job key the outbox dispatcher uses for the plan task of a command. */
export const planQueue = "plan";
export const planJobKey = (commandId: string) => `plan:${commandId}`;

/**
 * Records a command, its outbox row and its command.accepted event in one transaction
 * (runtime view, commission steps 1 and 2). A repeated idempotency key returns the stored command;
 * the same key with a different body is key_reused. A behind expectedCaseRevision is accepted here
 * and settled by the worker (rebase or rejected_stale), as the HTTP contract says.
 */
export async function submitCommand(
  pool: Pool,
  args: {
    caseId: string;
    ownerScopeId: string;
    request: CommandRequest;
    /** Commands the case may hold (demo sessions); a repeated key still returns its command. */
    maxCommands?: number | null;
    /** The instance's cap on live model spend; absent or without a cap decides nothing. */
    spendCap?: InstanceSpendPolicy;
    now?: Date;
  },
): Promise<SubmitOutcome> {
  const { caseId, ownerScopeId, request } = args;
  const now = (args.now ?? new Date()).toISOString();
  const requestHash = sha256Hex(canonicalJson(request));
  return inTransaction(pool, async (tx) => {
    const locked = await lockCase(tx, caseId);
    if (locked === null || locked.ownerScopeId !== ownerScopeId) {
      return { status: "not_found" };
    }
    const prior = await tx.query<{ record: Command; request_hash: string }>(
      "select record, request_hash from commands where case_id = $1 and idempotency_key = $2",
      [caseId, request.idempotencyKey],
    );
    const found = prior.rows[0];
    if (found !== undefined) {
      return found.request_hash === requestHash
        ? { status: "existing", command: found.record }
        : { status: "key_reused" };
    }
    if (args.maxCommands !== undefined && args.maxCommands !== null) {
      const held = await tx.query<{ n: string }>(
        "select count(*) as n from commands where case_id = $1",
        [caseId],
      );
      if (Number(held.rows[0]?.n) >= args.maxCommands) {
        return { status: "quota_exhausted" };
      }
    }
    if (
      request.expectedCaseRevision > locked.revision ||
      request.context.caseRevision > locked.revision
    ) {
      return { status: "revision_ahead", currentRevision: locked.revision };
    }
    if (args.spendCap && !(await spendAllows(tx, args.spendCap))) {
      return { status: "budget_exhausted" };
    }
    const commandId = newId("cmd");
    const planTaskId = newId("task");
    const command = Command.parse({
      recordType: "Command",
      schemaVersion: caseSchemaVersion,
      id: commandId,
      caseId,
      createdAt: now,
      idempotencyKey: request.idempotencyKey,
      expectedCaseRevision: request.expectedCaseRevision,
      context: request.context,
      text: request.text,
      intent: request.intent,
      status: "accepted",
      taskIds: [planTaskId],
    });
    await tx.query(
      `insert into commands (case_id, id, idempotency_key, request_hash, status, record)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        caseId,
        commandId,
        request.idempotencyKey,
        requestHash,
        command.status,
        JSON.stringify(command),
      ],
    );
    await tx.query(
      "insert into outbox (case_id, command_id, queue, job_key, payload) values ($1, $2, $3, $4, $5)",
      [
        caseId,
        commandId,
        planQueue,
        planJobKey(commandId),
        JSON.stringify({ caseId, commandId, planTaskId }),
      ],
    );
    const { lastSequence } = await insertEvents(
      tx,
      locked,
      [
        {
          occurredAt: now,
          kind: "command.accepted",
          commandId,
          taskId: null,
          entityIds: [commandId],
          message: eventMessages.commandAccepted(),
          dedupeKey: `command.accepted:${commandId}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
      ],
      locked.revision,
    );
    await setLastSequence(tx, caseId, lastSequence);
    await notifyEvents(tx, caseId);
    return { status: "created", command };
  });
}

const terminal = new Set<Command["status"]>([
  "succeeded",
  "partial",
  "failed",
  "cancelled",
  "rejected_stale",
]);

export type CancelOutcome =
  { status: "requested"; command: Command } | { status: "terminal" } | { status: "not_found" };

/** Cooperative cancellation: records the request; the worker checks it before each step. */
export async function requestCancel(
  pool: Pool,
  args: { commandId: string; ownerScopeId: string },
): Promise<CancelOutcome> {
  return inTransaction(pool, async (tx) => {
    const result = await tx.query<{ record: Command }>(
      `select c.record from commands c join cases k on k.id = c.case_id
       where c.id = $1 and k.owner_scope_id = $2 for update of c`,
      [args.commandId, args.ownerScopeId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return { status: "not_found" };
    }
    if (terminal.has(row.record.status)) {
      return { status: "terminal" };
    }
    await tx.query(
      "update commands set cancel_requested_at = coalesce(cancel_requested_at, now()) where id = $1",
      [args.commandId],
    );
    return { status: "requested", command: row.record };
  });
}

/**
 * Stores a new status for a command (worker side). Commands are execution records, not case
 * records, so their status updates in place; the transition itself is reported by events.
 */
export async function setCommandStatus(
  pool: Pool,
  commandId: string,
  status: Command["status"],
  taskIds?: string[],
): Promise<Command | null> {
  return inTransaction(pool, async (tx) => {
    const result = await tx.query<{ record: Command }>(
      "select record from commands where id = $1 for update",
      [commandId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const command = Command.parse({
      ...row.record,
      status,
      taskIds: taskIds ?? row.record.taskIds,
    });
    await tx.query(
      "update commands set status = $2, record = $3, updated_at = now() where id = $1",
      [commandId, status, JSON.stringify(command)],
    );
    return command;
  });
}

export async function isCancelRequested(pool: Pool, commandId: string): Promise<boolean> {
  const result = await pool.query<{ requested: boolean }>(
    "select cancel_requested_at is not null as requested from commands where id = $1",
    [commandId],
  );
  return result.rows[0]?.requested ?? false;
}
