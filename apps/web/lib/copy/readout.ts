// The answer column's words: the fixed words around the record fields the overview shows once a run has finished
// (the answer, the verdicts, what to check next, the views, a follow-up, the review). A sibling of en.ts with the same
// Message shape and the same lint (readout.test.ts runs it). No place name: every label, year and share in these
// sentences is a record field. No word of the record's own vocabulary either (merge, status, branch and the like).

import type { Message } from "./en";

export const rd = {
  // the answer in ink: how much of the area greened and browned since the first year of the share's own record
  "readout.answer.shares": {
    text: "Since {from}, {up} of the area has greened and {down} has browned.",
    kind: "ui",
  },
  "readout.answer.shareUp": { text: "Since {from}, {up} of the area has greened.", kind: "ui" },
  "readout.answer.shareDown": { text: "Since {from}, {down} of the area has browned.", kind: "ui" },
  "readout.answer.sharesNone": {
    text: "Since {from}, no part of the area has greened or browned.",
    kind: "ui",
  },
  // with nothing measured: the explanations that fit the evidence, else the ones that do not, else the ones without
  // enough data, else that none has been tested
  "readout.answer.fits.one": { text: "{labels} fits the evidence.", kind: "ui" },
  "readout.answer.fits.many": { text: "{labels} fit the evidence.", kind: "ui" },
  "readout.answer.doesNotFit.one": { text: "{labels} does not fit the evidence.", kind: "ui" },
  "readout.answer.doesNotFit.many": { text: "{labels} do not fit the evidence.", kind: "ui" },
  "readout.answer.open": { text: "Not enough data yet on {labels}.", kind: "ui" },
  "readout.answer.none": { text: "No explanation has been tested yet.", kind: "ui" },
  "readout.and": { text: "{first} and {last}", kind: "ui" },

  // an explanation's verdict: the same three words wherever one is said, and the mark of one the record moved past
  "readout.verdict.consistent": { text: "Fits", kind: "label" },
  "readout.verdict.cannot_be_assessed": { text: "Not enough data", kind: "label" },
  "readout.verdict.contradicted": { text: "Does not fit", kind: "label" },
  "readout.verdict.stale": { text: "out of date", kind: "label" },

  // what to check next: each field check with the explanations only it tells apart
  "readout.next.head": { text: "Next", kind: "label" },
  "readout.next.separates": { text: "{check} would tell {pairs}.", kind: "ui" },
  "readout.next.pair": { text: "{a} from {b}", kind: "ui" },
  "readout.next.check": { text: "{check}.", kind: "ui" },

  // the views, each one key away
  "readout.views.head": { text: "Look closer", kind: "label" },

  // a follow-up the visitor asked: its findings, the kinds that state no fact named before them
  "readout.request.head": { text: "Follow-up", kind: "label" },
  "readout.request.none": { text: "No findings for this question yet.", kind: "ui" },
  "readout.request.hypothesis": { text: "Hypothesis: {text}", kind: "ui" },
  "readout.request.scenario": { text: "Scenario: {text}", kind: "ui" },
  // the row under the first three findings, and the same row once all of them show
  "readout.request.all": { text: "Show all {n} findings", kind: "ui" },
  "readout.request.fewer": { text: "Show fewer", kind: "ui" },

  // the reviews requested of the plan, and the key that opens the brief
  "readout.review.requested": { text: "{roles} review requested", kind: "ui" },
  "readout.review.role.community_livelihood": { text: "Community", kind: "label" },
  "readout.review.role.scientific": { text: "Scientific", kind: "label" },
  "readout.review.role.program_coordination": { text: "Program", kind: "label" },
  "readout.review.role.other": { text: "Role", kind: "label" },
  "readout.review.key": { text: "E", kind: "label" },

  // a field check's group on the land (FindingMark)
  "readout.group.ground": { text: "On the ground", kind: "label" },

  // the key bar while the answer is shown
  "readout.key.views": { text: "Look Closer", kind: "heading" },
  "readout.key.brief": { text: "Export Brief", kind: "button" },
} as const satisfies Record<string, Message>;

export type ReadoutMessageId = keyof typeof rd;

/** A readout message with its {placeholders} filled; a missing value leaves its placeholder visible. */
export function rformat(
  id: ReadoutMessageId,
  values: Record<string, string | number> = {},
): string {
  return rd[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
