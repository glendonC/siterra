// The next-steps package's words (UI-2 unit 1), a sibling of en.ts with the same Message shape and the same lint
// (package.test.ts runs it): the printable brief, and the few package words the overview still shows. Every line
// the package shows is a record field; these are only the headings, labels and fixed sentences around them. No
// place name.

import type { Message } from "./en";

export const pkg = {
  // the brief's head: its state, then the one sentence that nothing has been sent, scheduled or authorized
  "brief.state": {
    text: "{state}. Nothing has been sent, scheduled or authorized.",
    kind: "ui",
    honesty: true,
  },
  // the brief's state as its record holds it, unless a review decision is recorded (lib/package/review.ts)
  "package.status.draft": { text: "Draft", kind: "label" },
  "package.status.ready_for_review": { text: "Ready for review", kind: "label" },
  "package.status.prepared": { text: "Prepared", kind: "label" },
  "package.status.stale": { text: "Out of date", kind: "label" },
  "package.status.superseded": { text: "Replaced", kind: "label" },

  // the brief's parts, in its order (CMP-14), with the plan and the responses between
  "package.section.known": { text: "Known", kind: "heading" },
  "package.section.uncertain": { text: "Uncertain", kind: "heading" },
  "package.section.measure": { text: "Measure Next", kind: "heading" },
  "package.section.responses": { text: "Candidate Responses", kind: "heading" },
  "package.section.resources": { text: "Resources", kind: "heading" },
  "package.section.prepared": { text: "Siterra Prepared", kind: "heading" },
  "package.section.authorization": { text: "Needs Authorization", kind: "heading" },
  "package.section.involve": { text: "Who Takes Part", kind: "heading" },
  "package.section.next": { text: "What Happens Next", kind: "heading" },

  // a line's kind, named only where it changes how the line reads, in the answer column's words (lib/copy/readout.ts)
  "package.claim.hypothesis": { text: "Hypothesis: {text}", kind: "ui", honesty: true },
  "package.claim.scenario": { text: "Scenario: {text}", kind: "ui", honesty: true },

  // the field plan: objective, then each measurement with where, when, how and who
  "package.objective": { text: "Objective", kind: "label" },
  "package.decision": { text: "Informs", kind: "label" },
  "package.what": { text: "What", kind: "label" },
  "package.where": { text: "Where", kind: "label" },
  "package.when": { text: "When", kind: "label" },
  "package.how": { text: "How", kind: "label" },
  "package.who": { text: "Who", kind: "label" },
  "package.place.choose": {
    text: "Kinds of place, not sampling points: the local team chooses the sites.",
    kind: "ui",
    honesty: true,
  },
  "package.deferred": { text: "Left for Later", kind: "heading" },
  "package.permissions": { text: "Before Field Work", kind: "heading" },

  // resources, by kind; how much of each, and what is still to check, said once when every resource shares it
  "package.kind.expertise": { text: "Expertise", kind: "label" },
  "package.kind.time": { text: "Time", kind: "label" },
  "package.kind.equipment": { text: "Equipment", kind: "label" },
  "package.kind.funding": { text: "Funding", kind: "label" },
  "package.kind.local_information": { text: "Local information", kind: "label" },
  "package.kind.permission": { text: "Permission", kind: "label" },
  "package.amount": { text: "Amount", kind: "label" },
  "package.amount.unknown": { text: "Not estimated", kind: "label", honesty: true },
  "package.amount.scenario_assumption": {
    text: "Assumed for a scenario",
    kind: "label",
    honesty: true,
  },
  "package.amount.source_supported": { text: "From a source", kind: "label" },
  "package.amount.confirmed": { text: "Confirmed", kind: "label" },
  "package.toCheck": { text: "To check", kind: "label" },

  // candidate responses: never ranked, never recommended
  "package.responses.note": {
    text: "None is ranked or recommended.",
    kind: "ui",
    honesty: true,
  },
  "package.assumes": { text: "Assumes", kind: "label" },
  "package.checkFirst": { text: "Check first", kind: "label" },
  "package.livelihood": { text: "Livelihoods", kind: "label" },
  "package.ecology": { text: "Ecology", kind: "label" },
  "package.reviewedBy": { text: "For review by", kind: "label" },
  "package.role.scientific": { text: "Scientific reviewers", kind: "label" },
  "package.role.community_livelihood": {
    text: "Community and livelihood reviewers",
    kind: "label",
  },
  "package.role.program_coordination": { text: "Program coordination reviewers", kind: "label" },
  // the reviews the plan asks for, one line for each state with the roles in it
  "package.reviews": { text: "{state}: {roles}.", kind: "ui" },
  "package.review.requested": {
    text: "Review requested, not yet given",
    kind: "label",
    honesty: true,
  },
  "package.review.approved": { text: "Approved", kind: "label" },
  "package.review.rejected": { text: "Rejected", kind: "label" },
  "package.review.changes_requested": { text: "Changes requested", kind: "label" },
  "package.review.deferred": { text: "Deferred", kind: "label" },
  "package.review.not_requested": { text: "Not requested", kind: "label" },
  "package.authority": {
    text: "No one's authority to decide has been established.",
    kind: "ui",
    honesty: true,
  },
  "package.conditions": { text: "Still Open", kind: "heading" },

  // sources and limits
  "package.sources": { text: "Sources", kind: "heading" },
  "package.source.missing": { text: "A source the case does not hold", kind: "ui" },
  // a study's cited pages, several at once
  "package.source.pages": { text: "pages {pages}", kind: "label" },
  "package.limitations": { text: "Limits", kind: "heading" },
  // the fixed sentences host code writes into a package (lib/package/host-text.ts), as the brief says them
  "package.host.noAuthority": {
    text: "Local authority and representation are not established.",
    kind: "ui",
    honesty: true,
  },
  "package.host.synthetic": {
    text: "An example written by hand: not drafted by a model, and not a plan anyone made.",
    kind: "ui",
    honesty: true,
  },
  "package.host.replaySynthetic": {
    text: "Written from example answers prepared by hand, not by a model.",
    kind: "ui",
    honesty: true,
  },
  "package.host.replayRecorded": {
    text: "Written from an earlier model answer, not a new model call.",
    kind: "ui",
    honesty: true,
  },

  // a line the record cites no source for
  "steps.noSource": { text: "No source cited", kind: "label", honesty: true },
  // a recorded review decision: recorded on the case only, nothing sent externally
  "review.approved": {
    text: "Plan approved (demo)",
    kind: "ui",
    honesty: true,
  },
  "review.changesRequested": {
    text: "Changes requested (demo)",
    kind: "ui",
    honesty: true,
  },
  "review.recordedNote": { text: "Reviewer note: {note}", kind: "ui" },
  // the overview's control that opens the printable brief
  "package.export": { text: "Export Brief", kind: "button" },

  // the printable brief
  "brief.title": { text: "Your Plan", kind: "heading" },
  "brief.question": { text: "Question", kind: "label" },
  "brief.print": { text: "Print Brief", kind: "button" },
  "brief.loading": { text: "Reading the case record", kind: "ui" },
  "brief.failed": { text: "The case record could not be read. Nothing is shown.", kind: "ui" },
  "brief.missing": { text: "The case holds no plan at this address.", kind: "ui" },
} as const satisfies Record<string, Message>;

export type PackageMessageId = keyof typeof pkg;

/** Lint exceptions by string ID with the reason (as en.ts's LINT_ALLOWLIST). */
export const PACKAGE_LINT_ALLOWLIST: Partial<
  Record<PackageMessageId, { rules: string[]; reason: string }>
> = {
  "brief.title": {
    rules: ["VT-45"],
    reason: "The printed brief carries the same 'Your Plan' title as the briefing it exports.",
  },
};

/** A package message with its placeholders filled; a missing value stays visible as {name}. */
export function pformat(
  id: PackageMessageId,
  values: Record<string, string | number> = {},
): string {
  return pkg[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
