// Claim rules, validation step 4 in docs/reference/agent-orchestration.md#validation, for one
// proposed evidence item. Reference existence (step 3) is checked by the caller, which passes the
// counts of cited records that resolved.

export type ClaimRuleCode = "claim_kind";

export interface ClaimRuleIssue {
  code: ClaimRuleCode;
  /** Field name inside the item, for example `measurementIds`. */
  field: string;
  message: string;
}

export interface ClaimRuleInput {
  claimKind: string;
  measurementIds: readonly string[];
  sourceId: string | null;
  locator: string | null;
  excerpt: string | null;
  scopeNote: string;
  /** For a cited source: whether its accessStatus is `retrieved`; null when no source is cited or it is unknown. */
  sourceRetrieved: boolean | null;
}

/** Claim kinds a P0 build may record. `verified_outcome` exists in the schema and is always rejected. */
export const P0_REJECTED_CLAIMS: ReadonlySet<string> = new Set(["verified_outcome"]);

export function claimRuleIssues(
  item: ClaimRuleInput,
  allowedKinds: ReadonlySet<string>,
): ClaimRuleIssue[] {
  const issues: ClaimRuleIssue[] = [];
  const add = (field: string, message: string): void => {
    issues.push({ code: "claim_kind", field, message });
  };
  if (P0_REJECTED_CLAIMS.has(item.claimKind)) {
    add("claimKind", `${item.claimKind} is not allowed in P0.`);
    return issues;
  }
  if (!allowedKinds.has(item.claimKind)) {
    add("claimKind", `${item.claimKind} is not allowed for this task.`);
    return issues;
  }
  const citesSource = item.sourceId !== null || item.locator !== null || item.excerpt !== null;
  switch (item.claimKind) {
    case "observation":
      if (item.measurementIds.length === 0)
        add("measurementIds", "An observation must cite at least one measurement.");
      if (citesSource) add("sourceId", "An observation cites measurements, not a source.");
      break;
    case "scientific_context":
      if (item.sourceId === null || item.locator === null || item.excerpt === null) {
        add("sourceId", "Published context must cite a source, a locator and an excerpt.");
      } else if (item.sourceRetrieved !== true) {
        add("sourceId", "Published context must cite a retrieved source.");
      }
      if (item.measurementIds.length > 0)
        add("measurementIds", "Published context cites a source, not measurements.");
      break;
    case "field_requirement":
      if (item.scopeNote.trim() === "")
        add("scopeNote", "A field requirement must state the decision it informs.");
      break;
    default:
      break;
  }
  return issues;
}
