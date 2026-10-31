// Request and response bodies that schemas/openapi.json adds to the case records: the command and
// review requests, problem details, the stream reset message, the trace and the usage response.
import { z } from "zod";
import { SuggestedQuestion } from "./analysis-config.ts";
import {
  BundleAssetRef,
  CanvasComponent,
  Command,
  Context,
  Event,
  InstrumentSpec,
  ReviewDecision,
  ValidationResult,
} from "./case.ts";
import { instrumentKinds } from "./instruments.ts";
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

export const PlanReviewDecisionRequest = z.strictObject({
  decision: z.enum(["approved", "changes_requested"]),
  note: z
    .string()
    .max(500)
    .refine((s: string) => !s.includes("\u0000"), {
      error: "Must not contain null bytes",
    })
    .optional(),
  idempotencyKey: Command.shape.idempotencyKey.optional(),
});
export type PlanReviewDecisionRequest = z.infer<typeof PlanReviewDecisionRequest>;

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

/**
 * One row of GET /api/cases/:id/usage: the model calls of a case on one route, provider, model and
 * replay origin. Counts come from the provider usage fields stored on model.completed events; a
 * replayed call costs nothing and is never summed with live calls.
 */
export const UsageRow = z.strictObject({
  route: z.enum(["live", "replay"]),
  provider: z.string().min(1),
  model: z.string().min(1),
  replayOrigin: z.enum(["synthetic", "recorded"]).nullable(),
  calls: z.int().min(0),
  /** Calls that ended refused, incomplete or failed. */
  unsuccessfulCalls: z.int().min(0),
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
  cachedInputTokens: z.int().min(0),
  reasoningTokens: z.int().min(0),
  /** Calls whose usage carried no token counts; their tokens are not in the sums. */
  callsWithoutTokens: z.int().min(0),
  /** Estimated from the price table the call was priced with; 0 on the replay route. */
  estimatedCostMicroUsd: z.int().min(0),
  /** Live calls with no cost estimate; their cost is not in the sum. */
  callsWithoutCost: z.int().min(0),
});
export type UsageRow = z.infer<typeof UsageRow>;

export const UsageResponse = z.strictObject({
  caseId: entityId,
  /** Costs are estimates (TR-06), never billed amounts. */
  costIsEstimate: z.literal(true),
  live: z.strictObject({ calls: z.int().min(0), estimatedCostMicroUsd: z.int().min(0) }),
  replay: z.strictObject({ calls: z.int().min(0) }),
  rows: z.array(UsageRow),
});
export type UsageResponse = z.infer<typeof UsageResponse>;

/**
 * Why an instrument asset can or cannot be drawn: the bundle is not in the case, it is not validated,
 * its collection lists no such asset key, or the listed file is missing or no longer matches its
 * checksum (or the server has no bundles folder). Missing is a value, never a silent gap.
 */
export const instrumentAssetStatuses = [
  "available",
  "bundle_not_in_case",
  "bundle_not_validated",
  "asset_key_unknown",
  "file_unavailable",
] as const;

/**
 * One bundle asset an instrument spec names, resolved against the bundle revision the spec pins
 * (INST-04). Available means the immutable URL, type, checksum and size of a file whose bytes
 * matched the collection's checksum when it was resolved; any other status carries none of them.
 */
export const InstrumentAsset = z
  .strictObject({
    bundleId: BundleAssetRef.shape.bundleId,
    assetKey: BundleAssetRef.shape.assetKey,
    status: z.enum(instrumentAssetStatuses),
    href: z.string().min(1).nullable(),
    contentType: z.string().min(1).nullable(),
    checksum: z.string().min(1).nullable(),
    size: z.int().min(0).nullable(),
  })
  .superRefine((asset, ctx) => {
    const fields = ["href", "contentType", "checksum", "size"] as const;
    for (const field of fields) {
      const absent = asset[field] === null;
      if (asset.status === "available" && absent) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "An available asset names its file",
        });
      } else if (asset.status !== "available" && !absent) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "An asset that is not available names no file",
        });
      }
    }
  });
export type InstrumentAsset = z.infer<typeof InstrumentAsset>;

export const InstrumentView = z.strictObject({
  spec: InstrumentSpec,
  /** The current components that bind this spec, by section and order. */
  components: z.array(CanvasComponent),
  /** Each bundle asset the spec names, once, in field order. */
  assets: z.array(InstrumentAsset),
});
export type InstrumentView = z.infer<typeof InstrumentView>;

/** GET /api/cases/:id/instruments: the instrument specs of the case as of one case revision. */
export const InstrumentListing = z.strictObject({
  caseId: entityId,
  caseRevision: z.int().min(1),
  instruments: z.array(InstrumentView),
  /**
   * The rules of the case configuration the composer could not open from the case's records now,
   * each with every reason, in the composer's own words. Only on the current revision, and only for
   * a case with a configuration.
   */
  blocked: z
    .array(
      z.strictObject({
        ruleId: z.string().min(1),
        kind: z.enum(instrumentKinds),
        reasons: z.array(z.string().min(1)).min(1),
      }),
    )
    .optional(),
  /** The rules whose explanations are not in play, so the composer did not try them. */
  notOpened: z.array(z.string().min(1)).optional(),
  /** Up to 3 starter questions from the case configuration whose cited records are available in the case. */
  suggestedQuestions: z.array(SuggestedQuestion).max(3).optional(),
});
export type InstrumentListing = z.infer<typeof InstrumentListing>;
