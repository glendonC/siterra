// The branch merge's reasons (packages/domain branches.ts) said plainly for the field plan: the record's numbers kept,
// no prediction ids or rule names on screen. A reason in no known form shows nothing beyond the status label.

import { format } from "../../copy/en";

const FAILED = /^Necessary prediction .+ is not met on adequate data\.$/;
const TOO_FEW =
  /^Necessary prediction .+ is not met over (\d+) periods?; .+ needs (\d+) periods? to contradict\.$/;
const NONE_RECORDED = /^No predictions were recorded\.$/;
const NONE_TESTABLE = /^No prediction is testable with the record\.$/;
const ALL_MET = /^Every testable prediction is met \((\d+) of (\d+) testable\)\.$/;

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
  const met = ALL_MET.exec(reason);
  if (met?.[1] !== undefined && met[2] !== undefined)
    return format("instrument.fieldPlan.reason.allMet", { n: met[1], of: met[2] });
  return null;
}
