import { canonicalJson, sha256Hex } from "./canonical-json.ts";

/**
 * The logical task result key (caseId, commandId, task kind, inputHash) as one string, so a retried
 * task finds its committed result (data-contracts.md, idempotency). inputHash is the SHA-256 of the
 * question and the input versions, in canonical JSON with the versions sorted by entity ID.
 */
export function taskResultKey(args: {
  caseId: string;
  commandId: string;
  taskKind: string;
  question: string;
  inputVersions: readonly { entityId: string; revision: number }[];
}): string {
  const inputVersions = [...args.inputVersions].sort((a, b) =>
    a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : a.revision - b.revision,
  );
  const inputHash = sha256Hex(canonicalJson({ question: args.question, inputVersions }));
  return `${args.caseId}:${args.commandId}:${args.taskKind}:${inputHash}`;
}
