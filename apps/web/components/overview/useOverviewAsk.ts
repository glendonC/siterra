"use client";

// The overview's ask, sent the way the valley's command line sent it (lib/case/command.ts): one case
// kept current by useCaseSession, the request built by commissionRequest from the viewer's words (or the case
// question when they typed none) and sent by submitCommand. Nothing is sent before Enter. After Enter the question's
// status (askStatus) follows the session's event log: a replay started here plays at the valley's reading pace
// (usePacedLog). The newest question is the one on screen: one asked while another is at work, or left with Esc, asks
// the one before it to stop. The session's snapshot is handed back so the page can reopen its records when a commit
// advances the case revision.

import type { CaseSnapshot, Event } from "@siterra/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replayOrigin } from "../../lib/activity/activity";
import { commandRunning } from "../../lib/card/work";
import { commissionRequest, requestText, submitCommand } from "../../lib/case/command";
import { askStatus, type AskStatus, type Refusal } from "../../lib/overview/ask-line";
import { usePacedLog } from "../activity/usePacedLog";
import { useCaseSession } from "../case/useCaseSession";

/** How long a failed question waits for the case record to name its cause before it is said without one. */
const CAUSE_WAIT_MS = 2000;

export interface OverviewAsk {
  /** Where the question sent from here stands: null until Enter, and again once it is left. */
  status: AskStatus | null;
  /** When the question on screen was sent (ms since the epoch), null before Enter: its steps count from it. */
  sentAt: number | null;
  /** The request sent from here, once accepted. */
  commandId: string | null;
  send: (typed: string) => void;
  /** Leaves the question sent from here: one still at work is asked to stop, and the page reads as before it. */
  reset: () => void;
  /** Whether live web, literature, and governance retrieval is enabled for questions sent from Ask. */
  liveSearch: boolean;
  setLiveSearch: (on: boolean) => void;
  /** The case as the session holds it now. */
  snapshot: CaseSnapshot;
  /** The session's events as they reach the page (a replay at reading pace): the run's own stream. */
  events: readonly Event[];
  /** True while a replay is actively pacing events. */
  pacing: boolean;
  /** Fast-forwards a paced replay to show all events immediately. */
  skipPacing: () => void;
  /** Requests cooperative cancellation of a live running command. */
  cancel: () => void;
}

/** Asks the server to stop a command; one that has already ended stays as it is. */
function cancelCommand(id: string): void {
  void fetch(`/api/commands/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => {
    // Ignore network/409 errors if command already completed
  });
}

export function useOverviewAsk(initial: CaseSnapshot, paused = false): OverviewAsk {
  const { snapshot, log } = useCaseSession(initial);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  // off, and nothing on screen turns it on: live web search is P1 (agent-orchestration.md) and costs per query with no
  // hard cap (02-architecture-constraints.md); the request still carries the field, so the server contract holds
  const [liveSearch, setLiveSearch] = useState(false);
  // the question on screen, counted: the server's answer to an earlier one is not this one's
  const asked = useRef(0);
  const sent = sentAt !== null;
  const running = commandId !== null && commandRunning(snapshot, log, commandId);
  // a replayed request started here plays out at reading pace, as on the valley
  const replay = commandId ? replayOrigin(log.events, commandId) : undefined;
  const paced = usePacedLog(log, commandId ?? undefined, replay !== undefined, paused);

  const send = useCallback(
    (typed: string) => {
      // the newest question is the one on screen: one still at work from here is asked to stop
      if (commandId !== null && running) cancelCommand(commandId);
      const mine = ++asked.current;
      setSentAt(Date.now());
      setRefusal(null);
      setCommandId(null);
      const text = requestText(typed, snapshot.case.objective);
      const body = commissionRequest(snapshot, text, crypto.randomUUID());
      submitCommand(snapshot.case.id, body, (input, init) => fetch(input, init))
        .then((r) => {
          if (mine !== asked.current) {
            // left before the server took it (Esc, or a newer question): it is asked to stop at once
            if (r.status === "accepted") cancelCommand(r.command.id);
            return;
          }
          if (r.status === "refused") {
            setRefusal({
              httpStatus: r.httpStatus,
              code: r.code,
              ...(r.limit ? { limit: r.limit } : {}),
            });
            return;
          }
          const id = r.command.id;
          setCommandId(id);
          fetch(
            `/api/cases/${encodeURIComponent(snapshot.case.id)}/commands/${encodeURIComponent(id)}/complete`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ liveSearch }),
            },
          )
            .then((res) => {
              // a completion the server would not start for this visit: no step of it will come
              if (mine !== asked.current || ![401, 403, 404].includes(res.status)) return;
              cancelCommand(id);
              setRefusal({ httpStatus: res.status, code: null });
            })
            .catch(() => {
              if (mine !== asked.current) return;
              cancelCommand(id);
              setRefusal({ httpStatus: null, code: null });
            });
        })
        .catch((e: unknown) => {
          console.error("Commission failed", e);
          if (mine === asked.current) setRefusal({ httpStatus: null, code: null });
        });
    },
    [commandId, liveSearch, running, snapshot],
  );

  const reset = useCallback(() => {
    asked.current += 1;
    if (commandId !== null && running) cancelCommand(commandId);
    setSentAt(null);
    setRefusal(null);
    setCommandId(null);
  }, [commandId, running]);

  // a failed question waits for the case record to name its cause, but not for ever
  const ended =
    commandId !== null &&
    !paced.pacing &&
    paced.log.events.some((e) => e.commandId === commandId && e.kind === "command.completed");
  const [overdue, setOverdue] = useState<string | null>(null);
  useEffect(() => {
    if (!ended) return;
    const id = commandId;
    const t = window.setTimeout(() => {
      setOverdue(id);
    }, CAUSE_WAIT_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [ended, commandId]);

  const status = useMemo(
    () =>
      askStatus({
        snapshot,
        log: paced.log,
        commandId,
        sent,
        refusal,
        pacing: paced.pacing,
        causeOverdue: commandId !== null && overdue === commandId,
      }),
    [snapshot, paced.log, paced.pacing, commandId, sent, refusal, overdue],
  );

  const cancel = useCallback(() => {
    if (commandId) cancelCommand(commandId);
  }, [commandId]);

  return {
    status,
    sentAt,
    send,
    reset,
    liveSearch,
    setLiveSearch,
    snapshot,
    commandId,
    events: paced.log.events,
    pacing: paced.pacing,
    skipPacing: paced.showAll,
    cancel,
  };
}
