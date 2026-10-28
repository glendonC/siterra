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
