import type { z } from "zod";

/**
 * Missing is a value: an available measurement has a number and no missing reason; any other
 * status has a null value and a stated reason (case.schema.json Measurement allOf).
 */
export function missingIsAValue(
  measurement: { status: string; value: number | null; missingReason: string | null },
  ctx: z.RefinementCtx,
): void {
  if (measurement.status === "available") {
    if (measurement.value === null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "An available measurement needs a value",
      });
    }
    if (measurement.missingReason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["missingReason"],
        message: "An available measurement has no missing reason",
      });
    }
  } else {
    if (measurement.value !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A measurement that is not available has a null value, never zero",
      });
    }
    if (measurement.missingReason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["missingReason"],
        message: "A measurement that is not available states its reason",
      });
    }
  }
}
