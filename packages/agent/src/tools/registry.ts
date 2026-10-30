import {
  compareSeriesTool,
  listRecipesTool,
  readEvidenceTool,
  readRecipeResultTool,
} from "./analysis-tools.ts";
import { compareEventsTool, readEventRecordTool } from "./event-tools.ts";
import { readCaseTool, readDatasetManifestTool, summarizeObservationsTool } from "./read-tools.ts";
import { readSourceTool, searchSourcesTool } from "./source-tools.ts";
import type { SearchBudget } from "./source-tools.ts";
import type { CaseStore } from "./store.ts";
import type { ToolHandler, ToolName } from "./tool.ts";

// The function tools a task may be offered: reads and deterministic computation only. Proposal
// names in Task.allowedTools are the task's structured output, never a function tool.

export const PROPOSAL_NAMES: ReadonlySet<ToolName> = new Set([
  "propose_plan",
  "propose_evidence",
  "propose_hypotheses",
  "propose_interventions",
  "propose_package",
  "propose_instruments",
  "propose_layout",
  "request_review",
]);

export class ToolRegistry {
  readonly #handlers = new Map<ToolName, ToolHandler<never>>();

  constructor(handlers: readonly ToolHandler<never>[]) {
    for (const handler of handlers) {
      if (PROPOSAL_NAMES.has(handler.name)) {
        throw new Error(`${handler.name} is a proposal, not a function tool`);
      }
      this.#handlers.set(handler.name, handler);
    }
  }

  /** The handlers among `allowed` that exist; unbuilt tools are left out, never stubbed. */
  forTask(allowed: readonly ToolName[]): ToolHandler<never>[] {
    return allowed.flatMap((name) => {
      const handler = this.#handlers.get(name);
      return handler ? [handler] : [];
    });
  }
}

/** P0 source searches per command (docs/reference/agent-orchestration.md#budgets). */
export const SEARCHES_PER_COMMAND = 10;

/**
 * The read tools built so far, bound to one case. Pass one `searchBudget` per command so every
 * task of the command draws on the same search allowance.
 */
export function caseToolRegistry(
  store: CaseStore,
  caseId: string,
  searchBudget: SearchBudget = { remaining: SEARCHES_PER_COMMAND },
): ToolRegistry {
  return new ToolRegistry([
    readCaseTool(store, caseId) as ToolHandler<never>,
    readDatasetManifestTool(store, caseId) as ToolHandler<never>,
    summarizeObservationsTool(store, caseId) as ToolHandler<never>,
    searchSourcesTool(store, caseId, searchBudget) as ToolHandler<never>,
    readSourceTool(store, caseId) as ToolHandler<never>,
    compareSeriesTool(store, caseId) as ToolHandler<never>,
    readEvidenceTool(store, caseId) as ToolHandler<never>,
    listRecipesTool(store, caseId) as ToolHandler<never>,
    readRecipeResultTool(store, caseId) as ToolHandler<never>,
    readEventRecordTool(store, caseId) as ToolHandler<never>,
    compareEventsTool(store, caseId) as ToolHandler<never>,
  ]);
}
