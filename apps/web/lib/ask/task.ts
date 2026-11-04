// The one task a question typed in the Ask runs (POST /api/cases/:id/commands/:commandId/complete): its id is
// "task_ask_" and six hex digits of the command id's SHA-256 (lib/live-place/follow-up.ts commandHash). The server
// writes it; the answer column reads the task's choice by it and the steps name it by it. Before the follow-up
// answered from the case's own findings its task was "task_cmd_" and the hash, and read sources instead.

import type { Task } from "@siterra/contracts";

const ASK = "task_ask_";
const EARLIER = "task_cmd_";

/** The follow-up's task id for a command's hash. */
export const askTaskId = (hash: string): string => `${ASK}${hash}`;

/** True for the task of a question answered from the case's own findings. */
export const isAskTaskId = (id: string | null | undefined): boolean => id?.startsWith(ASK) ?? false;

/**
 * How many of the case's findings a typed question's answer chose: the records its task names once it succeeded, none
 * when it did not; null for a command with no such task in the record (yet).
 */
export function chosenCount(
  tasks: readonly Pick<Task, "id" | "commandId" | "status" | "inputVersions">[],
  commandId: string | null,
): number | null {
  const task = tasks.filter((t) => t.commandId === commandId && isAskTaskId(t.id)).at(-1);
  if (!task) return null;
  return task.status === "succeeded" ? task.inputVersions.length : 0;
}

/** True for any task the follow-up route wrote, the earlier source-reading kind included. */
export const isFollowUpTaskId = (id: string | null | undefined): boolean =>
  isAskTaskId(id) || (id?.startsWith(EARLIER) ?? false);
