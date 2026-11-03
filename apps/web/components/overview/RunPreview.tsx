"use client";

// Development harness for recorded-run replay: renders the valley overview over the case's terrain with a recorded
// run in place of the live stream. `?at=<ms>` holds a specific timestamp for still frames; `?speed=` sets the replay
// multiplier (4x by default). Every screen it feeds indicates that it is a recording.

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
