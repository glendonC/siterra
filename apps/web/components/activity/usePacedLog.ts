"use client";

// A replay's events arrive at once, so its work would flash past. For a replayed request started in this
// tab, the log is played out one event at a time at a fixed reading pace, and the panel says so; a reload
// shows the whole log at once. Show all ends the pacing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { pacedEvents } from "../../lib/activity/activity";
import type { EventLog } from "../../lib/case/events";

/** One event every this many ms: the reading pace the panel names. */
export const READING_PACE_MS = 400;

export interface PacedLog {
  log: EventLog;
  /** True while events of the request are still waiting to be shown. */
  pacing: boolean;
  showAll: () => void;
}

export function usePacedLog(
  log: EventLog,
  commandId: string | undefined,
  paced: boolean,
  paused = false,
): PacedLog {
  const [shown, setShown] = useState(0);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setShown(0);
    setAll(false);
  }, [commandId]);
  const total = useMemo(
    () => (commandId ? log.events.filter((e) => e.commandId === commandId).length : 0),
    [log, commandId],
  );
  const active = paced && !all && commandId !== undefined;
  const pacing = active && shown < total;
  useEffect(() => {
    if (!pacing || paused) return;
    const t = window.setTimeout(() => {
      setShown((n) => n + 1);
    }, READING_PACE_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [pacing, paused, shown]);
  const showAll = useCallback(() => {
    setAll(true);
  }, []);
  const view = useMemo(
    () =>
      active && commandId ? { ...log, events: pacedEvents(log.events, commandId, shown) } : log,
    [active, log, commandId, shown],
  );
  return { log: view, pacing, showAll };
}
