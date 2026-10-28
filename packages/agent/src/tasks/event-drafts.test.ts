import { describe, expect, it } from "vitest";

import { NumberedEventSink, dedupeKey } from "./event-drafts.ts";
import type { EventDraftRecord } from "./event-drafts.ts";
import type { TraceEventDraft } from "./trace.ts";

const event = (taskId: string, kind: TraceEventDraft["kind"]): TraceEventDraft => ({
  kind,
  taskId,
  occurredAt: "2026-10-27T20:00:00.000Z",
  entityIds: [],
  message: "Tool read_case started.",
  resultStatus: null,
  usage: null,
  tool: null,
  validation: null,
});

describe("event drafts", () => {
  it("numbers events per task and keys them by attempt and ordinal", () => {
    const out: EventDraftRecord[] = [];
    const attempts = new Map([["task_test_a", 1]]);
    const sink = new NumberedEventSink(
      "cmd_test",
      (id) => attempts.get(id) ?? 0,
      (d) => out.push(d),
    );
    sink.emit(event("task_test_a", "model.started"));
    sink.emit(event("task_test_a", "model.completed"));
    sink.emit(event("task_test_b", "model.started"));
    expect(out.map((d) => d.dedupeKey)).toEqual([
      dedupeKey("task_test_a", 1, "model.started", 1),
      dedupeKey("task_test_a", 1, "model.completed", 2),
      dedupeKey("task_test_b", 0, "model.started", 1),
    ]);
    expect(new Set(out.map((d) => d.dedupeKey)).size).toBe(3);
    expect(out[0]).toMatchObject({ commandId: "cmd_test", spanId: null, parentSpanId: null });
  });

  it("a retried attempt gets new keys; a re-delivered event keeps its key", () => {
    expect(dedupeKey("task_test_a", 2, "model.started", 1)).not.toBe(
      dedupeKey("task_test_a", 1, "model.started", 1),
    );
    expect(dedupeKey("task_test_a", 1, "model.started", 1)).toBe(
      dedupeKey("task_test_a", 1, "model.started", 1),
    );
    expect(dedupeKey("task_test_a", 1, "model.started", 1)).toMatch(/^evt-[0-9a-f]{32}$/);
  });
});
