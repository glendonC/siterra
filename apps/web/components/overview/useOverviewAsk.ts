"use client";

// The overview's ask, sent the way the valley's command line sent it (lib/case/command.ts): one case
// kept current by useCaseSession, the request built by commissionRequest from the viewer's words (or the case
// question when they typed none) and sent by submitCommand, one at a time. Nothing is sent before Enter. After
// Enter the activity line follows the session's event log (askLine): a replay started here plays at the valley's
// reading pace (usePacedLog). The session's snapshot is handed back so the page can reopen its records when a
// commit advances the case revision.

import type { CaseSnapshot, Event } from "@siterra/contracts";
import { useCallback, useMemo, useRef, useState } from "react";
import { replayOrigin } from "../../lib/activity/activity";
import { commandRunning } from "../../lib/card/work";
import { commissionRequest, requestText, submitCommand } from "../../lib/case/command";
import type { MessageId } from "../../lib/copy/en";
import { askLine, type AskLine } from "../../lib/overview/ask-line";
import { usePacedLog } from "../activity/usePacedLog";
import { useCaseSession } from "../case/useCaseSession";

export interface OverviewAsk {
  /** The line under the question: null until Enter. */
  activity: AskLine | null;
  /** The request sent from here, once accepted. */
  commandId: string | null;
  send: (typed: string) => void;
  /** Whether live web, literature, and governance retrieval is enabled for questions sent from Ask. */
  liveSearch: boolean;
  setLiveSearch: (on: boolean) => void;
  /** The case as the session holds it now. */
  snapshot: CaseSnapshot;
  /** The session's events as they reach the page (a replay at reading pace): the run's own stream (U29). */
  events: readonly Event[];
  /** True while a replay is actively pacing events. */
  pacing: boolean;
  /** Fast-forwards a paced replay to show all events immediately. */
  skipPacing: () => void;
  /** Requests cooperative cancellation of a live running command. */
  cancel: () => void;
}

export function useOverviewAsk(initial: CaseSnapshot, paused = false): OverviewAsk {
  const { snapshot, log } = useCaseSession(initial);
  const [sent, setSent] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [notice, setNotice] = useState<MessageId | null>(null);
  const [liveSearch, setLiveSearch] = useState(true);
  const submitting = useRef(false);
  const running = commandId !== null && commandRunning(snapshot, log, commandId);
  // a replayed request started here plays out at reading pace, as on the valley
  const replay = commandId ? replayOrigin(log.events, commandId) : undefined;
  const paced = usePacedLog(log, commandId ?? undefined, replay !== undefined, paused);

  const send = useCallback(
    (typed: string) => {
      // one submission in flight at a time; a request already running is not doubled
      if (submitting.current || running || paced.pacing) return;
      submitting.current = true;
      setSent(true);
      setNotice(null);
      setCommandId(null);
      const text = requestText(typed, snapshot.case.objective);
      const body = commissionRequest(snapshot, text, crypto.randomUUID());
      submitCommand(snapshot.case.id, body, (input, init) => fetch(input, init))
        .then((r) => {
          if (r.status === "refused") {
            setNotice(
              r.code !== "quota_exhausted"
                ? "work.refused"
                : r.limit === "instance"
                  ? "work.instanceLimit"
                  : "work.quotaUsed",
            );
          } else {
            setCommandId(r.command.id);
            void fetch(
              `/api/cases/${encodeURIComponent(snapshot.case.id)}/commands/${encodeURIComponent(r.command.id)}/complete`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ liveSearch }),
              },
            ).catch(() => {
              // Ignored when E2E tests intercept /commands with a synthetic command ID
            });
          }
        })
        .catch((e: unknown) => {
          console.error("Commission failed", e);
          setNotice("work.refused");
        })
        .finally(() => {
          submitting.current = false;
        });
    },
    [running, paced.pacing, snapshot, liveSearch],
  );

  const activity = useMemo(
    () => askLine({ snapshot, log: paced.log, commandId, sent, notice, pacing: paced.pacing }),
    [snapshot, paced.log, paced.pacing, commandId, sent, notice],
  );

  const cancel = useCallback(() => {
    if (!commandId) return;
    void fetch(`/api/commands/${encodeURIComponent(commandId)}/cancel`, {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {
      // Ignore network/409 errors if command already completed
    });
  }, [commandId]);

  return {
    activity,
    send,
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
