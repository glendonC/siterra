// The field-validation plan rules a commit enforces (DF-06; components.md CMP-13): a
// field_validation_plan action carries a plan and no other action does; every measurement names a
// gap or a hypothesis it would resolve, in strata the plan defines; every open gap of the case is
// measured or deferred with a reason, never both. Gaps are accepted field_requirement Evidence.
import type { OperationalAction } from "@siterra/contracts";

export type FieldPlanContext = {
  /** IDs of the case's current accepted field_requirement Evidence. */
  openGapIds: ReadonlySet<string>;
  /** IDs of the case's current hypotheses. */
  hypothesisIds: ReadonlySet<string>;
};

/** What makes an action's field plan break the rules; empty when it holds. */
export function fieldPlanIssues(
  action: Pick<OperationalAction, "id" | "kind" | "fieldPlan">,
  context: FieldPlanContext,
): string[] {
  const plan = action.fieldPlan;
  if (action.kind !== "field_validation_plan") {
    return plan === undefined
      ? []
      : [`${action.id}: only a field_validation_plan carries a field plan`];
  }
  if (plan === undefined) {
    return [`${action.id}: a field_validation_plan needs its field plan`];
  }
  const issues: string[] = [];
  const keys = plan.strata.map((s) => s.key);
  for (const key of new Set(keys.filter((k, i) => keys.indexOf(k) !== i))) {
    issues.push(`stratum ${key} is defined twice`);
  }
  const measured = new Set<string>();
  plan.measurements.forEach((m, i) => {
    const row = `measurement ${String(i + 1)}`;
    for (const key of m.stratumKeys) {
      if (!keys.includes(key)) issues.push(`${row}: stratum ${key} is not defined`);
    }
    if (m.resolvesGapIds.length === 0 && m.discriminatesHypothesisIds.length === 0) {
      issues.push(`${row}: names no gap or hypothesis it would resolve`);
    }
    for (const id of m.resolvesGapIds) {
      if (!context.openGapIds.has(id)) issues.push(`${row}: ${id} is not an open gap`);
      measured.add(id);
    }
    for (const id of m.discriminatesHypothesisIds) {
      if (!context.hypothesisIds.has(id))
        issues.push(`${row}: ${id} is not a hypothesis of the case`);
    }
  });
  const deferred = new Set<string>();
  for (const { gapId } of plan.deferredGaps) {
    if (deferred.has(gapId)) issues.push(`gap ${gapId} is deferred twice`);
    if (!context.openGapIds.has(gapId)) issues.push(`deferred ${gapId} is not an open gap`);
    if (measured.has(gapId)) issues.push(`gap ${gapId} is both measured and deferred`);
    deferred.add(gapId);
  }
  for (const id of [...context.openGapIds].sort()) {
    if (!measured.has(id) && !deferred.has(id)) {
      issues.push(`open gap ${id} is neither measured nor deferred with a reason`);
    }
  }
  return issues;
}
