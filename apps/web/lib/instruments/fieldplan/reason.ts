// The branch merge's reasons (packages/domain branches.ts) said plainly for the field plan: the record's numbers kept,
// no prediction ids or rule names on screen (predictions are counted, never named). A reason in no known form shows
// nothing beyond the status label.

import { format } from "../../copy/en";

const FAILED = /^Necessary prediction .+ is not met on adequate data\.$/;
const TOO_FEW =
  /^Necessary prediction .+ is not met over (\d+) periods?; .+ needs (\d+) periods? to contradict\.$/;
const NONE_RECORDED = /^No predictions were recorded\.$/;
const NONE_TESTABLE = /^No prediction is testable with the record\.$/;
const ALL_MET = /^Every testable prediction is met \((\d+) of (\d+) testable\)\.$/;
const NOT_NEEDED =
  /^Prediction (.+) is not met but not necessary, so the rules set no other status\.$/;
const OPTIONAL =
  /^Optional prediction (.+) (?:is|are) not met; (\d+) of (\d+) necessary predictions? (?:is|are) met\.$/;

/** How many predictions a reason lists ("p1" or "p1, p3"): counted, never shown. */
const countKeys = (keys: string) => keys.split(",").filter((k) => k.trim() !== "").length;

export function plainReason(reason: string): string | null {
  if (FAILED.test(reason)) return format("instrument.fieldPlan.reason.failed", {});
  const few = TOO_FEW.exec(reason);
  if (few?.[1] !== undefined && few[2] !== undefined)
    return format(
      few[1] === "1"
        ? "instrument.fieldPlan.reason.tooFew.one"
        : "instrument.fieldPlan.reason.tooFew",
      { have: few[1], need: few[2] },
    );
  if (NONE_RECORDED.test(reason)) return format("instrument.fieldPlan.reason.noneRecorded", {});
  if (NONE_TESTABLE.test(reason)) return format("instrument.fieldPlan.reason.noneTestable", {});
  const notNeeded = NOT_NEEDED.exec(reason);
  if (notNeeded?.[1] !== undefined) {
    const n = countKeys(notNeeded[1]);
    return n === 1
      ? format("instrument.fieldPlan.reason.notNeeded.one", {})
      : format("instrument.fieldPlan.reason.notNeeded", { n });
  }
  const optional = OPTIONAL.exec(reason);
  if (optional?.[1] !== undefined && optional[2] !== undefined && optional[3] !== undefined) {
    const n = countKeys(optional[1]);
    const need =
      optional[3] === "1"
        ? format("instrument.fieldPlan.reason.optional.need.one", {})
        : format("instrument.fieldPlan.reason.optional.need", {
            met: optional[2],
            of: optional[3],
          });
    return n === 1
      ? format("instrument.fieldPlan.reason.optional.one", { need })
      : format("instrument.fieldPlan.reason.optional", { need, n });
  }
  const met = ALL_MET.exec(reason);
  if (met?.[1] !== undefined && met[2] !== undefined)
    return format("instrument.fieldPlan.reason.allMet", { n: met[1], of: met[2] });
  return null;
}
