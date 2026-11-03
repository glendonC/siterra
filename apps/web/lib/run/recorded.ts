"use client";

// A recorded run fed to the overview in place of the ask's live stream (U29; the lead, 30 Oct: the RECORDED run
// "Founder instance smoke 1", for tests and frames only, and every screen it feeds says it is a recording). The
// development harness provides it; the product's overview never does. Its events are revealed on a replay clock in
// their recorded order and spacing, so the same event model the live stream feeds unfolds it.

import type { CaseSnapshot, Event } from "@siterra/contracts";
import { createContext, useEffect, useRef, useState } from "react";

export interface RecordedRun {
  commandId: string;
  question: string;
  snapshot: CaseSnapshot;
  events: readonly Event[];
  /** Times faster than it ran (the specimen's 4). */
  speed: number;
  /** A fixed moment of the run (ms after acceptance), for still frames; null plays from the start. */
  at: number | null;
}

export const RecordedRunContext = createContext<RecordedRun | null>(null);

/** Milliseconds after the command's acceptance that an event occurred. */
export function eventMs(run: Pick<RecordedRun, "events" | "commandId">, e: Event): number {
  const accepted = run.events.find(
    (x) => x.commandId === run.commandId && x.kind === "command.accepted",
  );
  return Date.parse(e.occurredAt) - Date.parse(accepted?.occurredAt ?? e.occurredAt);
}

/** The events given by a moment of the run, in their recorded order. */
export function revealed(run: RecordedRun, ms: number): Event[] {
  return run.events.filter((e) => eventMs(run, e) <= ms);
}

/** The run's own length (ms), its last event after acceptance. */
export function lengthOf(run: RecordedRun): number {
  return run.events.reduce((m, e) => Math.max(m, eventMs(run, e)), 0);
}

/**
 * The replay clock (ms of run time), ticking at the run's speed in steps of 100 ms from when the overview's land is
 * drawn; fixed at `at` when given.
 */
export function useRecordedClock(run: RecordedRun | null, paused = false): number {
  const [ms, setMs] = useState(() => run?.at ?? 0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (!run || run.at !== null) return;
    const end = lengthOf(run);
    // the replay starts once the land is drawn, so the run's first moments are not played to a blank screen
    let lastTick: number | null = null;
    let accMs = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (lastTick === null) {
        if (!document.querySelector("[data-overview-root][data-ready]:not([data-arriving])"))
          return;
        lastTick = now;
      }
      if (pausedRef.current) {
        lastTick = now;
        return;
      }
      accMs = Math.min(end, accMs + (now - lastTick) * run.speed);
      lastTick = now;
      setMs(accMs >= end ? end : Math.floor(accMs / 100) * 100);
      if (accMs >= end) window.clearInterval(id);
    }, 50);
    return () => {
      window.clearInterval(id);
    };
  }, [run]);
  return run?.at ?? ms;
}
