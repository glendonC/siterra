"use client";

// Development harness for U29: the overview over the case's own land, with the RECORDED run of specimen R at work on
// it in place of the ask's live stream. ?at=<ms of run time> holds a moment for still frames; ?speed= sets the replay
// speed (the specimen's 4 by default). Every screen it feeds says it is a recording.

import { Event, type CaseSnapshot } from "@siterra/contracts";
import { useMemo } from "react";
import raw from "../../lib/run/fixtures/recorded-run.json";
import { RecordedRunContext, type RecordedRun } from "../../lib/run/recorded";
import { InstrumentRecords } from "../instruments/InstrumentRecords";
import { ValleyOverview } from "./ValleyOverview";

export function RunPreview() {
  const run = useMemo((): RecordedRun => {
    const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    const at = q.get("at");
    return {
      commandId: raw.commandId,
      question: raw.question,
      snapshot: raw.snapshot as unknown as CaseSnapshot,
      events: (raw.events as unknown[]).map((e) => Event.parse(e)),
      speed: Number(q.get("speed") ?? 4) || 4,
      at: at === null ? null : Number(at),
    };
  }, []);
  return (
    <main>
      <RecordedRunContext.Provider value={run}>
        <InstrumentRecords>
          <ValleyOverview />
        </InstrumentRecords>
      </RecordedRunContext.Provider>
    </main>
  );
}
