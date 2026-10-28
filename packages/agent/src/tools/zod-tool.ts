import { z } from "zod";

import type { JsonSchema } from "../model/types.ts";
import { jsonPath } from "../tasks/validation.ts";
import type { ParsedArgs } from "./tool.ts";

/** A model-facing argument schema exported under the strict-subset rules, without `$schema`. */
export function argumentSchema(schema: z.ZodType): JsonSchema {
  const exported = {
    ...(z.toJSONSchema(schema, { cycles: "throw", reused: "inline" }) as JsonSchema),
  };
  delete exported["$schema"];
  return exported;
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
