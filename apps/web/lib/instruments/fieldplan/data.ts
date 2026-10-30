// The field plan instrument's data: the branch merge a field plan spec names (parameters.branchMergeId), its
// explanations in the merge's order with the status the merge gave each branch and why, and the proposed field
// checks with the pairs of explanations each one tells apart. Read from the case's records; nothing is scheduled.

import type { CaseSnapshot } from "@siterra/contracts";

type Records = Pick<CaseSnapshot["records"], "branchMergeRecords" | "explanationBranchRecords">;
type Pair = [string, string];

export interface FieldPlanExplanation {
  id: string;
  label: string;
  /** The merge's status for the branch: contradicted, cannot_be_assessed, and so on. */
  status: string;
  reason: string;
}

export interface FieldPlanCheck {
  id: string;
  label: string;
  /** Pairs of explanation ids this check tells apart. */
  separates: Pair[];
  /** The pairs no other proposed check tells apart. */
  onlySeparates: Pair[];
}

export interface FieldPlanData {
  mergeId: string;
  explanations: FieldPlanExplanation[];
  checks: FieldPlanCheck[];
  /** Pairs of open explanations that no proposed check tells apart. */
  unseparated: Pair[];
}

export function fieldPlanFrom(mergeId: string, records: Records): FieldPlanData {
  const merge = records.branchMergeRecords?.find((m) => m.id === mergeId);
  if (!merge?.fieldPlan) throw new Error(`The case holds no field plan in ${mergeId}`);
  const branches = records.explanationBranchRecords ?? [];
  const explanations = merge.branches.map((b) => {
    const branch = branches.find((r) => r.id === b.branchId && r.revision === b.branchRevision);
    return {
      id: b.explanationId,
      label: branch?.label ?? b.explanationId,
      status: b.status,
      reason: b.reason,
    };
  });
  const pairs = (v: readonly (readonly string[])[]): Pair[] =>
    v.map((p): Pair => [p[0] ?? "", p[1] ?? ""]);
  return {
    mergeId,
    explanations,
    checks: merge.fieldPlan.measurements.map((m) => ({
      id: m.fieldCheckId,
      label: m.label,
      separates: pairs(m.separates),
      onlySeparates: pairs(m.onlySeparates),
    })),
    unseparated: pairs(merge.fieldPlan.unseparated),
  };
}
