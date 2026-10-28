import { z } from "zod";

/** Record identifier: `type_slug`, as in docs/reference/data-contracts.md#identifiers. */
export const entityIdPattern = /^[a-z][a-z0-9_]*_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
export const entityId = z.string().regex(entityIdPattern);

/** Calendar month period identifier, `period_YYYY-MM` (UTC, start inclusive, end exclusive). */
export const periodIdPattern = /^period_[0-9]{4}-(0[1-9]|1[0-2])$/;
export const periodId = z.string().regex(periodIdPattern);

/** RFC 3339 date-time with a time zone, as JSON Schema `format: date-time` asserts. */
export const dateTime = z.iso.datetime({ offset: true });

/** RFC 3339 full date, as JSON Schema `format: date` asserts. */
export const isoDate = z.iso.date();

/** Absolute URI, as JSON Schema `format: uri` asserts. */
export const uri = z.url();

/** JSON Schema `uniqueItems: true`: items compare by their JSON text. */
export function uniqueArray<T extends z.ZodType>(item: T) {
  return z
    .array(item)
    .refine((items) => new Set(items.map((x) => JSON.stringify(x))).size === items.length, {
      error: "Array items must be unique",
    });
}

/** The number of Unicode code points, the unit JSON Schema minLength and maxLength count. */
export function codePointLength(value: string): number {
  let count = 0;
  for (const _ of value) {
    count += 1;
  }
  return count;
}

/**
 * A string bounded in code points, as JSON Schema counts them; Zod's .min and .max count UTF-16
 * units, which differ for characters outside the Basic Multilingual Plane. The bounds also go into
 * the JSON Schema export as minLength and maxLength.
 */
export function text(bounds: { min?: number; max?: number }) {
  const { min, max } = bounds;
  return z
    .string()
    .superRefine((value, ctx) => {
      const length = codePointLength(value);
      if (min !== undefined && length < min) {
        ctx.addIssue({
          code: "too_small",
          origin: "string",
          minimum: min,
          inclusive: true,
          input: value,
          message: `Too short: at least ${min} characters`,
        });
      }
      if (max !== undefined && length > max) {
        ctx.addIssue({
          code: "too_big",
          origin: "string",
          maximum: max,
          inclusive: true,
          input: value,
          message: `Too long: at most ${max} characters`,
        });
      }
    })
    .meta({
      ...(min === undefined ? {} : { minLength: min }),
      ...(max === undefined ? {} : { maxLength: max }),
    });
}
