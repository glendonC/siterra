import { describe, expect, it } from "vitest";
import { lint } from "./lint";
import { rd, rformat, type ReadoutMessageId } from "./readout";

// The answer column's words pass the same copy lint as en.ts (VC-06), with no allowlist, and name no place.
describe("readout catalog", () => {
  const entries = Object.entries(rd) as [ReadoutMessageId, (typeof rd)[ReadoutMessageId]][];

  it.each(entries)("%s passes the copy lint", (_id, msg) => {
    expect(lint(msg.text, msg.kind)).toEqual([]);
  });

  it("names no place: every place word comes from a record field", () => {
    const named = entries
      .filter(([, m]) =>
        /valley|bouguemez|tabant|ouchi|aït|high atlas|atlas mountains|morocco|calaveras/i.test(
          m.text,
        ),
      )
      .map(([id]) => id);
    expect(named).toEqual([]);
  });

  it("fills placeholders and leaves a missing one visible", () => {
    expect(rformat("readout.answer.shareUp", { from: 2000, up: "24.7%" })).toBe(
      "Since 2000, 24.7% of the area has greened.",
    );
    expect(rformat("readout.answer.shareUp", { up: "24.7%" })).toBe(
      "Since {from}, 24.7% of the area has greened.",
    );
  });

  it("says each verdict in the same three words", () => {
    expect(
      (["consistent", "cannot_be_assessed", "contradicted"] as const).map(
        (s) => rd[`readout.verdict.${s}`].text,
      ),
    ).toEqual(["Fits", "Not enough data", "Does not fit"]);
  });

  it("holds the words the column shows around the record", () => {
    const shown: Record<string, { text: string; kind: string }> = {
      "readout.answer.none": { text: "No explanation has been tested yet.", kind: "ui" },
      "readout.verdict.stale": { text: "out of date", kind: "label" },
      "readout.next.head": { text: "Next", kind: "label" },
      "readout.next.separates": { text: "{check} would tell {pairs}.", kind: "ui" },
      "readout.next.pair": { text: "{a} from {b}", kind: "ui" },
      "readout.views.head": { text: "Look closer", kind: "label" },
      "readout.request.head": { text: "Follow-up", kind: "label" },
      "readout.request.none": { text: "No findings for this question yet.", kind: "ui" },
      "readout.key.views": { text: "Look Closer", kind: "heading" },
    };
    for (const [id, msg] of Object.entries(shown)) {
      expect(id in rd ? rd[id as ReadoutMessageId] : null).toEqual(msg);
    }
  });

  it("drops the words nothing shows any more", () => {
    // no source chip, no claim kind tag or scope line, no reasons, predictions, scores or revisions, no proposed checks
    // with their season and place, and no status words of the record's own
    for (const id of [
      "readout.recorded",
      "readout.kind.observation",
      "readout.kind.measurement",
      "readout.kind.status",
      "readout.scope.fdr",
      "readout.settle.head",
      "readout.ground.proposed",
      "readout.ground.notDrawn",
      "readout.ground.where",
      "readout.stale",
      "readout.revisions",
      "readout.separates",
      "readout.unseparated",
      "readout.prediction.necessary",
      "readout.score.met",
      "readout.measured.shares",
      "readout.group.explanations",
      "readout.key.explanations",
      "readout.key.details",
      "readout.review.approve",
      "readout.review.changes",
    ]) {
      expect(id in rd, id).toBe(false);
    }
  });

  it("starts every share sentence from the first year of the share's own record", () => {
    for (const id of [
      "readout.answer.shares",
      "readout.answer.sharesNone",
      "readout.answer.shareUp",
      "readout.answer.shareDown",
    ] as const) {
      expect(rd[id].text).toMatch(/^Since \{from\}, /);
    }
  });
});
