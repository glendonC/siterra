import { lastSequenceOf } from "@siterra/db";
import { database, eventHub } from "../../../database.ts";
import { caseEventStream, streamCursor } from "../../../event-stream.ts";
import { problem } from "../../../problem.ts";
import { requestOwner } from "../../../session.ts";

export const dynamic = "force-dynamic";

/** GET /api/cases/:id/events?after=: Server-Sent Events of persisted events with replay after a cursor. */
export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const { caseId } = await context.params;
  const owner = await requestOwner(request);
  if (owner === null) {
    return problem(401, "unauthenticated");
  }
  const after = streamCursor(request);
  if (after === "invalid") {
    return problem(
      400,
      "invalid_request",
      "after and Last-Event-ID take a non-negative integer sequence",
    );
  }
  const pool = database();
  const lastSequence = await lastSequenceOf(pool, caseId, owner);
  if (lastSequence === null) {
    return problem(404, "not_found");
  }
  const stream = caseEventStream({
    pool,
    hub: eventHub(),
    caseId,
    after,
    lastSequence,
    signal: request.signal,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
