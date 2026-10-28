// Event messages are host templates, never model text (data-contracts.md, events). Wording follows
// docs/reference/microcopy.md; each template names its row. Templates marked "no approved row" use
// the closest approved wording until DESIGN adds a row for them.

type ReviewRole = "scientific" | "community_livelihood" | "program_coordination";
type ReviewStatus = "changes_requested" | "approved" | "rejected" | "deferred";

export const eventMessages = {
  /** microcopy.md, director status "Accepted": "Request received". */
  commandAccepted: () => "Request received",

  /**
   * microcopy.md, section 14 confirmations (and section 21, "Review recorded"):
   * scientific: "Scientific review recorded in demo mode."
   * community and livelihood: "Community consultation marked as required."
   * program approval: "Program review marked complete in demo mode. Community consultation is still
   * outstanding." (the community role cannot be completed inside the demo, so it is always outstanding).
   * No approved row: a program decision other than approval, which reads "Program review recorded in
   * demo mode." because "marked complete" would be untrue for it.
   */
  reviewRecorded: (role: ReviewRole, status: ReviewStatus) => {
    switch (role) {
      case "scientific":
        return "Scientific review recorded in demo mode.";
      case "community_livelihood":
        return "Community consultation marked as required.";
      case "program_coordination":
        return status === "approved"
          ? "Program review marked complete in demo mode. Community consultation is still outstanding."
          : "Program review recorded in demo mode.";
    }
  },

  /** No approved row; closest approved pattern "Loaded 84 monthly observations" (microcopy.md, milestones). */
  caseSeeded: (bundleCount: number) => `Loaded ${bundleCount} observation bundles`,

  /** No approved row; written in the same plain voice. */
  demoCopyOpened: () => "Opened a demo copy of the case",

  /** No approved row; uses the approved status word "Needs reassessment" (microcopy.md, statuses). */
  entitiesStale: (count: number) =>
    count === 1
      ? "1 record needs reassessment after an input changed"
      : `${count} records need reassessment after an input changed`,
} as const;

/** Event texts that have no approved microcopy row yet, for DESIGN. */
export const eventMessagesWithoutApprovedRow = [
  "Program review recorded in demo mode.",
  "Loaded {count} observation bundles",
  "Opened a demo copy of the case",
  "{count} records need reassessment after an input changed",
] as const;
