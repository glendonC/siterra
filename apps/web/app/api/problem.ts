import type { ProblemCode, ValidationResult } from "@siterra/contracts";
import type { z } from "zod";

const titles: Record<ProblemCode, string> = {
  invalid_request: "Invalid request",
  unauthenticated: "Not signed in",
  not_found: "Not found",
  idempotency_key_reused: "Idempotency key reused",
  quota_exhausted: "Quota exhausted",
  command_not_cancellable: "Command can no longer be cancelled",
  stale_versions: "Stale versions",
  decision_not_permitted: "Decision not permitted",
  internal_error: "Internal error",
};

/** Problem details (RFC 9457) with a machine-readable code (openapi.json, Problem). */
export function problem(
  status: number,
  code: ProblemCode,
  detail?: string,
  issues?: ValidationResult["issues"],
): Response {
  return Response.json(
    { type: "about:blank", title: titles[code], status, code, detail, issues },
    {
      status,
      headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
    },
  );
}

/** Zod issues as ValidationResult issues with JSON Pointer paths. */
export function schemaIssues(error: z.ZodError): ValidationResult["issues"] {
  return error.issues.map((issue) => ({
    code: "schema" as const,
    path: `/${issue.path.map((p) => String(p)).join("/")}`,
    message: issue.message,
  }));
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
