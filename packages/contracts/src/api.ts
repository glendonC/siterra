// Request and response bodies that schemas/openapi.json adds to the case records: the command and
// review requests, problem details, the stream reset message and the trace response.
import { z } from "zod";
import { Command, Context, Event, ReviewDecision, ValidationResult } from "./case.ts";
import { dateTime, entityId } from "./primitives.ts";

export const CommandRequest = z.strictObject({
  text: Command.shape.text,
  intent: Command.shape.intent,
  context: Context,
  expectedCaseRevision: Command.shape.expectedCaseRevision,
  idempotencyKey: Command.shape.idempotencyKey,
});
export type CommandRequest = z.infer<typeof CommandRequest>;

export const ReviewRequest = z.strictObject({
  role: ReviewDecision.shape.role,
  reviewedEntityVersions: ReviewDecision.shape.reviewedEntityVersions,
  caseRevisionReviewed: ReviewDecision.shape.caseRevisionReviewed,
  actionId: ReviewDecision.shape.actionId,
  decision: z.enum(["changes_requested", "approved", "rejected", "deferred"]),
  conditions: ReviewDecision.shape.conditions,
  comments: ReviewDecision.shape.comments,
  mode: ReviewDecision.shape.mode,
  idempotencyKey: Command.shape.idempotencyKey,
});
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ProblemCode = z.enum([
  "invalid_request",
  "unauthenticated",
  "not_found",
  "idempotency_key_reused",
  "quota_exhausted",
  "command_not_cancellable",
  "stale_versions",
  "decision_not_permitted",
  "internal_error",
]);
export type ProblemCode = z.infer<typeof ProblemCode>;

export const Problem = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: ProblemCode,
  issues: ValidationResult.shape.issues.optional(),
});
export type Problem = z.infer<typeof Problem>;

export const StreamReset = z.strictObject({ reason: z.literal("history_unavailable") });
export type StreamReset = z.infer<typeof StreamReset>;

const spanAttributeValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

export const spanAttributeKeyPattern = /^(gen_ai|siterra|error|server)\.[a-z0-9_.]+$/;

export const TraceSpan = z.strictObject({
  traceId: entityId,
  spanId: z.string().min(1),
  parentSpanId: z.string().min(1).nullable(),
  name: z.string().min(1),
  kind: z.enum(["INTERNAL", "CLIENT"]),
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
  status: z.enum(["unset", "ok", "error"]),
  attributes: z.record(z.string().regex(spanAttributeKeyPattern), spanAttributeValue),
});
export type TraceSpan = z.infer<typeof TraceSpan>;

export const TraceResponse = z.strictObject({
  caseId: entityId,
  commandId: entityId,
  spans: z.array(TraceSpan),
  events: z.array(Event),
});
export type TraceResponse = z.infer<typeof TraceResponse>;
