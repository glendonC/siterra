"use client";

// One case revision kept current: the event log from the stream (replayed from the start on load, so a
// reload rebuilds the same state, and resumed with Last-Event-ID on reconnect), and the snapshot read
// again whenever an event changes records. The snapshot stays authoritative; events say when to reread.

import type { CaseSnapshot, Event } from "@siterra/contracts";
import { useEffect, useRef, useState } from "react";
import { appendEvents, changesRecords, EMPTY_LOG, type EventLog } from "../../lib/case/events";
import { loadSnapshot } from "../../lib/case/load";

export interface CaseSession {
  snapshot: CaseSnapshot;
  log: EventLog;
  /** True while the stream is connected. */
  connected: boolean;
}

export function useCaseSession(initial: CaseSnapshot): CaseSession {
  const [snapshot, setSnapshot] = useState(initial);
  const [log, setLog] = useState<EventLog>(EMPTY_LOG);
  const [connected, setConnected] = useState(false);
  const reread = useRef<number | undefined>(undefined);
  const caseId = initial.case.id;

  useEffect(() => {
    const refresh = () => {
      window.clearTimeout(reread.current);
      reread.current = window.setTimeout(() => {
        loadSnapshot(caseId, (input, init) => fetch(input, init))
          .then((r) => {
            if (r.status === "ready") setSnapshot(r.snapshot);
          })
          .catch((e: unknown) => {
            console.error("Case: reread failed", e);
          });
      }, 120);
    };
    const source = new EventSource(`/api/cases/${encodeURIComponent(caseId)}/events?after=0`);
    source.onopen = () => {
      setConnected(true);
    };
    source.onerror = () => {
      // EventSource reconnects by itself and sends Last-Event-ID; the log ignores what it already holds
      setConnected(false);
    };
    source.onmessage = (m: MessageEvent<string>) => {
      const e = JSON.parse(m.data) as Event;
      setLog((l) => appendEvents(l, [e]));
      if (changesRecords(e)) refresh();
    };
    source.addEventListener("reset", () => {
      // the cursor is beyond the log: start again from the records
      setLog(EMPTY_LOG);
      refresh();
    });
    return () => {
      source.close();
      window.clearTimeout(reread.current);
    };
  }, [caseId]);

  return { snapshot, log, connected };
}
