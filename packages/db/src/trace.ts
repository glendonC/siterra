// Internal spans: one trace per command, named after the OpenTelemetry GenAI conventions so a later
// exporter needs no renaming (research/technology/observability.md). Only allowlisted attributes
// are stored; the conventions' opt-in content attributes are refused, so prompts, messages and tool
// arguments never reach the database or the trace inspector (TR-03).
import { type Event, TraceResponse, TraceSpan, codePointLength } from "@siterra/contracts";
import { z } from "zod";
import type { Pool } from "./client.ts";

/** The GenAI semantic convention revision the span names and attributes follow (Development status). */
export const genAiConventions = "https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev";

/** Opt-in content attributes of the conventions, plus their earlier names; never stored. */
export const contentAttributeKeys: readonly string[] = [
  "gen_ai.input.messages",
  "gen_ai.output.messages",
  "gen_ai.system_instructions",
  "gen_ai.tool.definitions",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
  "gen_ai.prompt",
  "gen_ai.completion",
];

export const SpanRecord = TraceSpan.extend({ caseId: z.string(), taskId: z.string().nullable() });
export type SpanRecord = z.infer<typeof SpanRecord>;

/** A span that names a content attribute; nothing is written. */
export class SpanRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpanRejected";
  }
}

/**
 * The siterra.* attributes a span may carry, from the span table of
 * research/technology/observability.md; any other siterra.* key is refused, so a custom attribute
 * cannot smuggle content (for example siterra.prompt or siterra.source_text).
 */
export const siterraAttributeKeys: readonly string[] = [
  "siterra.case_id",
  "siterra.command_id",
  "siterra.job_id",
  "siterra.base_revision",
  "siterra.case_revision",
  "siterra.provider.api",
  "siterra.web_search.calls",
  "siterra.refused",
  "siterra.attempts",
  "siterra.validation.outcome",
];

/** Longest string attribute value, in code points, and most items in an array value. */
export const maxAttributeTextLength = 256;
export const maxAttributeItems = 32;

/** A content key itself, or any key under it (gen_ai.input.messages.0, gen_ai.prompt.0.content). */
export function isContentKey(key: string): boolean {
  return contentAttributeKeys.some((content) => key === content || key.startsWith(`${content}.`));
}

function attributeIssues(attributes: SpanRecord["attributes"]): string[] {
  const issues: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (isContentKey(key)) {
      issues.push(`${key} is a content attribute`);
    } else if (key.startsWith("siterra.") && !siterraAttributeKeys.includes(key)) {
      issues.push(`${key} is not an allowed siterra attribute`);
    }
    const values = Array.isArray(value) ? value : [value];
    if (values.length > maxAttributeItems) {
      issues.push(`${key} has more than ${maxAttributeItems} items`);
    }
    for (const item of values) {
      if (typeof item === "string" && codePointLength(item) > maxAttributeTextLength) {
        issues.push(`${key} is longer than ${maxAttributeTextLength} characters`);
        break;
      }
    }
  }
  return issues;
}

function checked(span: SpanRecord): SpanRecord {
  const parsed = SpanRecord.parse(span);
  const issues = attributeIssues(parsed.attributes);
  if (issues.length > 0) {
    throw new SpanRejected(`Span attributes refused: ${issues.join("; ")}`);
  }
  return parsed;
}

/** Writes a span, or replaces an unfinished one with the same ID (for example to set endedAt). */
export async function recordSpan(pool: Pool, input: SpanRecord): Promise<void> {
  const span = checked(input);
  await pool.query(
    `insert into spans (case_id, span_id, trace_id, parent_span_id, task_id, name, kind, status, started_at, ended_at, attributes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (case_id, span_id) do update set status = excluded.status, ended_at = excluded.ended_at,
       attributes = excluded.attributes
     where spans.ended_at is null`,
    [
      span.caseId,
      span.spanId,
      span.traceId,
      span.parentSpanId,
      span.taskId,
      span.name,
      span.kind,
      span.status,
      span.startedAt,
      span.endedAt,
      JSON.stringify(span.attributes),
    ],
  );
}

/**
 * The command's spans in start order and its events in sequence order, for the trace inspector;
 * null when the command is not on a case of this owner.
 */
export async function readTrace(
  pool: Pool,
  args: { caseId: string; commandId: string; ownerScopeId: string },
): Promise<TraceResponse | null> {
  const owned = await pool.query(
    `select 1 from commands c join cases k on k.id = c.case_id
     where c.id = $1 and c.case_id = $2 and k.owner_scope_id = $3`,
    [args.commandId, args.caseId, args.ownerScopeId],
  );
  if (owned.rowCount === 0) {
    return null;
  }
  const spans = await pool.query<{
    span_id: string;
    trace_id: string;
    parent_span_id: string | null;
    name: string;
    kind: "INTERNAL" | "CLIENT";
    status: "unset" | "ok" | "error";
    started_at: Date;
    ended_at: Date | null;
    attributes: Record<string, unknown>;
  }>(
    `select span_id, trace_id, parent_span_id, name, kind, status, started_at, ended_at, attributes
     from spans where case_id = $1 and trace_id = $2 order by started_at, span_id`,
    [args.caseId, args.commandId],
  );
  const events = await pool.query<{ record: Event }>(
    "select record from events where case_id = $1 and command_id = $2 order by sequence",
    [args.caseId, args.commandId],
  );
  return TraceResponse.parse({
    caseId: args.caseId,
    commandId: args.commandId,
    spans: spans.rows.map((row) => ({
      traceId: row.trace_id,
      spanId: row.span_id,
      parentSpanId: row.parent_span_id,
      name: row.name,
      kind: row.kind,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at === null ? null : row.ended_at.toISOString(),
      status: row.status,
      attributes: row.attributes,
    })),
    events: events.rows.map((row) => row.record),
  });
}
