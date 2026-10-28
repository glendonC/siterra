import type { Event } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { EMPTY_LOG, appendEvents, changesRecords, latestCommandId } from "./events";

// Synthetic events for the reducer only.
const ev = (sequence: number, kind: Event["kind"], commandId: string | null = null): Event =>
  ({ sequence, kind, commandId, id: `evt_${String(sequence)}`, message: kind }) as unknown as Event;

describe("appendEvents", () => {
  it("keeps each event once and in order when a reconnect replays some", () => {
    let log = appendEvents(EMPTY_LOG, [
      ev(1, "case.committed"),
      ev(2, "command.accepted", "cmd_a"),
    ]);
    log = appendEvents(log, [ev(2, "command.accepted", "cmd_a"), ev(3, "task.queued")]);
    expect(log.events.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(log.lastSequence).toBe(3);
  });

  it("returns the same log when nothing is new", () => {
    const log = appendEvents(EMPTY_LOG, [ev(1, "case.committed")]);
    expect(appendEvents(log, [ev(1, "case.committed")])).toBe(log);
  });
});

describe("latestCommandId", () => {
  it("finds the newest accepted command", () => {
    const log = appendEvents(EMPTY_LOG, [
      ev(1, "command.accepted", "cmd_a"),
      ev(2, "task.queued"),
      ev(3, "command.accepted", "cmd_b"),
    ]);
    expect(latestCommandId(log)).toBe("cmd_b");
    expect(latestCommandId(EMPTY_LOG)).toBeUndefined();
  });
});

describe("changesRecords", () => {
  it("is true for commits and task changes, false for model progress", () => {
    expect(changesRecords(ev(1, "case.committed"))).toBe(true);
    expect(changesRecords(ev(1, "task.succeeded"))).toBe(true);
    expect(changesRecords(ev(1, "model.started"))).toBe(false);
  });
});
