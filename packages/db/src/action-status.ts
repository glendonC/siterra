// Action status after review decisions (review-and-authority.md, state and invalidation; runtime
// view, scenario review): an action awaiting review becomes "Prepared (demo)" when every required
// role that can be completed in the demo has approved its current version and every action it
// depends on is prepared. The community and livelihood role cannot be completed in the demo, so
// when it is required the action is prepared with that consultation still listed as outstanding.
// An approval never forces prepared while another required review or a dependency is missing.
import type { OperationalAction, ReviewDecision } from "@siterra/contracts";

/** The condition a prepared action keeps while community consultation is required (runtime view). */
export const consultationOutstanding = "Community consultation outstanding";

/**
 * The next revision of the action marked prepared, or null when it stays as it is. `decisions` are
 * the latest, non-stale decisions on this action; only those on its current version count.
 */
export function preparedAction(
  action: OperationalAction,
  decisions: readonly ReviewDecision[],
  dependencyStatuses: ReadonlyMap<string, OperationalAction["status"]>,
  now: string,
): OperationalAction | null {
  if (action.status !== "awaiting_review") {
    return null;
  }
  const current = decisions.filter(
    (d) =>
      !d.stale &&
      d.actionId === action.id &&
      d.reviewedEntityVersions.some(
        (v) => v.entityId === action.id && v.revision === action.revision,
      ),
  );
  const completable = action.requiredReviewRoles.filter((role) => role !== "community_livelihood");
  // Per role only its latest decision on the current version counts (by decision time, then
  // creation time), so a later rejection or request for changes withdraws an earlier approval.
  // A review request is not a decision.
  const latestByRole = new Map<ReviewDecision["role"], ReviewDecision>();
  for (const d of current.filter((d) => d.status !== "requested" && d.status !== "not_requested")) {
    const seen = latestByRole.get(d.role);
    const key = (x: ReviewDecision) => `${x.decisionAt ?? ""}|${x.createdAt}`;
    if (seen === undefined || key(d) > key(seen)) {
      latestByRole.set(d.role, d);
    }
  }
  const approved = new Set(
    [...latestByRole.values()].filter((d) => d.status === "approved").map((d) => d.role),
  );
  if (completable.length === 0 || completable.some((role) => !approved.has(role))) {
    return null;
  }
  if (action.dependsOnActionIds.some((id) => dependencyStatuses.get(id) !== "prepared")) {
    return null;
  }
  const conditions = [
    ...action.remainingConditions,
    ...(action.requiredReviewRoles.includes("community_livelihood")
      ? [consultationOutstanding]
      : []),
    ...current.flatMap((d) => d.conditions),
  ];
  return {
    ...action,
    revision: action.revision + 1,
    updatedAt: now,
    status: "prepared",
    remainingConditions: [...new Set(conditions)],
    reviewDecisionIds: [...new Set([...action.reviewDecisionIds, ...current.map((d) => d.id)])],
  };
}
