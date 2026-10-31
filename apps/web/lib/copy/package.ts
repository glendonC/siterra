// The next-steps package's words (UI-2 unit 1), a sibling of en.ts with the same Message shape and the same lint
// (package.test.ts runs it): the "What to Do Next" card on the land and the printable brief. Every line the package
// shows is a record field; these are only the headings, labels and fixed sentences around them. No place name.

import type { Message } from "./en";

export const pkg = {
  // the card and the button in the results that opens it
  "package.title": { text: "What to Do Next", kind: "heading" },
  "package.open": { text: "What to Do Next", kind: "button" },
  "package.nothingSent": {
    text: "A draft for review. Nothing has been sent, scheduled or authorized.",
    kind: "ui",
    honesty: true,
  },
  "package.none": {
    text: "This question has no prepared package in the record yet.",
    kind: "ui",
    honesty: true,
  },
  "package.revision": { text: "Prepared on case revision {n}", kind: "label" },
  "package.staleRevision": {
    text: "The case changed after this package. Prepared on revision {n}, the case is at {now}.",
    kind: "ui",
    honesty: true,
  },

  // the brief's status word and the action's (status words are headings: Title Case)
  "package.status.draft": { text: "Draft", kind: "heading" },
  "package.status.ready_for_review": { text: "Ready for Review", kind: "heading" },
  "package.status.prepared": { text: "Prepared", kind: "heading" },
  "package.status.stale": { text: "Out of Date", kind: "heading" },
  "package.status.superseded": { text: "Replaced", kind: "heading" },
  "package.action.awaiting_review": { text: "Awaiting Review", kind: "heading" },
  "package.action.draft": { text: "Draft", kind: "heading" },
  "package.action.prepared": { text: "Prepared", kind: "heading" },
  "package.action.blocked": { text: "Blocked", kind: "heading" },
  "package.action.cancelled": { text: "Canceled", kind: "heading" },
  "package.action.superseded": { text: "Replaced", kind: "heading" },

  // how the package was made, from the brief's mode and its limitations
  "package.mode.replay": {
    text: "Replayed run: not a live model call",
    kind: "label",
    honesty: true,
  },
  "package.mode.concept": { text: "Concept case", kind: "label", honesty: true },
  "package.mode.live": { text: "Live run", kind: "label" },

  // the card's sections, in the brief's order (CMP-14), with the plan and the responses between
  "package.section.known": { text: "Known", kind: "heading" },
  "package.section.uncertain": { text: "Uncertain", kind: "heading" },
  "package.section.measure": { text: "Measure Next", kind: "heading" },
  "package.section.responses": { text: "Candidate Responses", kind: "heading" },
  "package.section.resources": { text: "Resources", kind: "heading" },
  "package.section.prepared": { text: "Siterra Prepared", kind: "heading" },
  "package.section.authorization": { text: "Needs Authorization", kind: "heading" },
  "package.authorization.note": {
    text: "A person with the authority decides each of these; Siterra cannot.",
    kind: "ui",
    honesty: true,
  },
  "package.section.involve": { text: "Who Takes Part", kind: "heading" },
  "package.section.next": { text: "What Happens Next", kind: "heading" },
  // the short names in the card's part row

  // a line's claim kind, as the brief records it
  "package.claim.observation": { text: "Observation", kind: "label" },
  "package.claim.scientific_context": { text: "Published context", kind: "label" },
  "package.claim.hypothesis": { text: "Explanation to test", kind: "label", honesty: true },
  "package.claim.model_estimate": { text: "Model estimate", kind: "label", honesty: true },
  "package.claim.scenario": { text: "Scenario", kind: "label", honesty: true },
  "package.claim.field_requirement": { text: "Needs a field check", kind: "label" },
  "package.claim.verified_outcome": { text: "Verified outcome", kind: "label" },

  // the field plan: objective, then each measurement with where, when, how and who
  "package.objective": { text: "Objective", kind: "label" },
  "package.decision": { text: "Informs", kind: "label" },
  "package.what": { text: "What", kind: "label" },
  "package.where": { text: "Where", kind: "label" },
  "package.when": { text: "When", kind: "label" },
  "package.how": { text: "How", kind: "label" },
  "package.who": { text: "Who", kind: "label" },
  "package.answers": { text: "Answers", kind: "label" },
  "package.fieldCheck": { text: "Serves the field check: {label}", kind: "label" },
  "package.place.text": {
    text: "A kind of place, not drawn on the land",
    kind: "label",
    honesty: true,
  },
  "package.place.choose": {
    text: "Kinds of place, not sampling points: the local team chooses the sites.",
    kind: "ui",
    honesty: true,
  },
  "package.deferred": { text: "Left for Later", kind: "heading" },
  "package.fromPlan": {
    text: "From the field plan Siterra drafted; a person reviews it.",
    kind: "ui",
    honesty: true,
  },
  "package.permissions": { text: "Before Field Work", kind: "heading" },

  // resources, by kind, with the record's estimate status
  "package.kind.expertise": { text: "Expertise", kind: "label" },
  "package.kind.time": { text: "Time", kind: "label" },
  "package.kind.equipment": { text: "Equipment", kind: "label" },
  "package.kind.funding": { text: "Funding", kind: "label" },
  "package.kind.local_information": { text: "Local information", kind: "label" },
  "package.kind.permission": { text: "Permission", kind: "label" },
  "package.estimate.unknown": { text: "Amount not estimated", kind: "label", honesty: true },
  "package.estimate.scenario_assumption": {
    text: "Amount assumed for a scenario",
    kind: "label",
    honesty: true,
  },
  "package.estimate.source_supported": { text: "Amount from a source", kind: "label" },
  "package.estimate.confirmed": { text: "Amount confirmed", kind: "label" },
  "package.toCheck": { text: "To check: {what}", kind: "label" },

  // candidate responses: never ranked, never recommended
  "package.responses.note": {
    text: "Candidate responses, in the record's order. None is ranked or recommended.",
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
    text: "No one's authority to decide is established in this record.",
    kind: "ui",
    honesty: true,
  },
  "package.conditions": { text: "Still Open", kind: "heading" },

  // sources: numbered chips, the same rule as the results
  "package.chip": { text: "Source {n}", kind: "label" },
  "package.sources": { text: "Sources", kind: "heading" },
  "package.limitations": { text: "Package Limits", kind: "heading" },

  // the briefing on the land: its panels, the measurements standing on their places, the keys
  "briefing.open": { text: "Still Open", kind: "heading" },
  "briefing.onLand": { text: "Where to Measure", kind: "heading" },
  "briefing.proposed": {
    text: "Proposed field check. Not measured.",
    kind: "label",
    honesty: true,
  },
  "briefing.offLand": { text: "Not drawn on the land", kind: "label", honesty: true },
  "briefing.back": { text: "Back", kind: "button" },
  "briefing.region": { text: "The next-steps package", kind: "ui" },
  "briefing.counts": {
    text: "{measures}, {responses} and {resources}, ready for a person to review.",
    kind: "ui",
  },
  "briefing.count.measure.one": { text: "One field check", kind: "label" },
  "briefing.count.measure.many": { text: "{n} field checks", kind: "label" },
  "briefing.count.response.one": { text: "one candidate response", kind: "label" },
  "briefing.count.response.many": { text: "{n} candidate responses", kind: "label" },
  "briefing.count.resource.one": { text: "one resource", kind: "label" },
  "briefing.count.resource.many": { text: "{n} resources", kind: "label" },
  "briefing.chip": { text: "Source {n}", kind: "label" },
  // the action prompt beside a pointed item (decision 15)
  "prompt.label": { text: "Actions for this item", kind: "ui" },
  "prompt.read": { text: "Read the Source", kind: "button" },
  // the briefing you step through (decision 16): a headline on arrival, then five steps, one card at a time
  "steps.headline": { text: "What to do next: {checks} before any decision", kind: "ui" },
  "steps.count.one": { text: "one field check", kind: "label" },
  "steps.count.many": { text: "{n} field checks", kind: "label" },
  "steps.known": { text: "Known So Far", kind: "heading" },
  "steps.open": { text: "Still Open", kind: "heading" },
  "steps.checks": { text: "The Field Checks", kind: "heading" },
  "steps.responses": { text: "Candidate Responses", kind: "heading" },
  "steps.approve": { text: "Who Must Approve", kind: "heading" },
  "steps.of": { text: "{n} of {total}", kind: "label" },
  "steps.begin": { text: "Begin", kind: "button" },
  "steps.next": { text: "Next", kind: "button" },
  "steps.previous": { text: "Previous", kind: "button" },
  "steps.settles": { text: "Serves the field check: {label}", kind: "label" },
  "steps.noneRanked": { text: "None is ranked or recommended.", kind: "ui", honesty: true },
  "steps.offLand": { text: "A kind of place, not drawn on the land.", kind: "ui", honesty: true },
  "steps.replay": { text: "Replayed, not a live run", kind: "label", honesty: true },
  "steps.noSource": { text: "No source cited", kind: "label", honesty: true },
  "steps.nothingSent": { text: "Nothing sent or authorized.", kind: "label", honesty: true },
  "steps.counter": { text: "Steps of the briefing", kind: "ui" },
  // the controls and their keys
  "package.export": { text: "Export Brief", kind: "button" },

  // the printable brief (daylight palette)
  "brief.title": { text: "What to Do Next", kind: "heading" },
  "brief.kicker": { text: "Next-steps package prepared by Siterra", kind: "ui" },
  "brief.question": { text: "Question", kind: "label" },
  "brief.print": { text: "Print Brief", kind: "button" },
  "brief.loading": { text: "Reading the case record", kind: "ui" },
  "brief.failed": { text: "The case record could not be read. Nothing is shown.", kind: "ui" },
  "brief.missing": { text: "The record holds no package with this id.", kind: "ui" },
  "brief.footer": {
    text: "Every line cites the record it comes from. Siterra sends, spends and decides nothing; a person decides.",
    kind: "ui",
    honesty: true,
  },
  "brief.case": { text: "Case {id}, revision {n}", kind: "label" },
} as const satisfies Record<string, Message>;

export type PackageMessageId = keyof typeof pkg;

/** Lint exceptions by string ID with the reason (as en.ts's LINT_ALLOWLIST). */
export const PACKAGE_LINT_ALLOWLIST: Partial<
  Record<PackageMessageId, { rules: string[]; reason: string }>
> = {
  "package.title": {
    rules: ["VT-48"],
    reason:
      "The founder's and the lead's name for the package; four short words read as one title.",
  },
  "package.open": {
    rules: ["VT-48"],
    reason: "The button names the card it opens, with the card's own title.",
  },
  "brief.title": {
    rules: ["VT-48"],
    reason: "The printed brief carries the same title as the card it exports.",
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
