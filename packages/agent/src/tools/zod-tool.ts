import { toModelJsonSchema } from "@siterra/contracts";
import type { z } from "zod";

import type { JsonSchema } from "../model/types.ts";
import { jsonPath } from "../tasks/validation.ts";
import type { ParsedArgs } from "./tool.ts";

/** A model-facing argument schema, exported by the contracts package under the strict-subset rules. */
export function argumentSchema(schema: z.ZodType): JsonSchema {
  return toModelJsonSchema(schema);
}

export function parseWith<A>(schema: z.ZodType<A>, args: unknown): ParsedArgs<A> {
  const parsed = schema.safeParse(args);
  if (parsed.success) return { ok: true, value: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    message: first ? `${jsonPath(first.path)}: ${first.message}` : "arguments did not validate",
  };
}
