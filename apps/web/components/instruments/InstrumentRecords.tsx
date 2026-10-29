"use client";

// The case records the instruments draw: the case the valley opens (?case=, or the visitor's demo copy of the seed
// case) and its instrument specs from GET /api/cases/:id/instruments, opened once per page and shared by the
// instruments inside the shell. A page can be handed records instead (the lane's preview).

import type { CaseSnapshot, InstrumentListing, InstrumentView } from "@siterra/contracts";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { instrumentOf, openInstruments, type CaseInstruments } from "../../lib/instruments/listing";
import { viewerStorage } from "../../lib/shell/preferences";

export type InstrumentRecordsState =
  | { status: "opening" }
  | { status: "ready"; snapshot: CaseSnapshot; listing: InstrumentListing }
  | { status: "failed" };

const Records = createContext<InstrumentRecordsState>({ status: "opening" });

/** One open per page: an effect that runs twice (React's development check) shares the first request. */
let opening: Promise<CaseInstruments> | undefined;

export function InstrumentRecords({
  records,
  children,
}: {
  records?: { snapshot: CaseSnapshot; listing: InstrumentListing };
  children: ReactNode;
}) {
  const [state, setState] = useState<InstrumentRecordsState>(
    records ? { status: "ready", ...records } : { status: "opening" },
  );
  useEffect(() => {
    if (records) return;
    let live = true;
    const caseId = new URLSearchParams(window.location.search).get("case") ?? undefined;
    opening ??= openInstruments(
      caseId,
      (input, init) => fetch(input, init),
      viewerStorage(),
      Date.now(),
    );
    opening
      .then((r) => {
        if (!live) return;
        if (r.status === "ready")
          setState({ status: "ready", snapshot: r.snapshot, listing: r.listing });
        else {
          console.error("Instrument records could not be opened", r);
          setState({ status: "failed" });
        }
      })
      .catch((e: unknown) => {
        console.error("Instrument records could not be opened", e);
        if (live) setState({ status: "failed" });
      });
    return () => {
      live = false;
    };
  }, [records]);
  return <Records.Provider value={state}>{children}</Records.Provider>;
}

export type InstrumentRecord =
  | { status: "opening" }
  | { status: "ready"; view: InstrumentView; snapshot: CaseSnapshot }
  | { status: "failed" };

/** The ready spec of one instrument kind, with the case it belongs to. */
export function useInstrument(
  kind: InstrumentView["spec"]["parameters"]["kind"],
): InstrumentRecord {
  const state = useContext(Records);
  if (state.status !== "ready") return state;
  const view = instrumentOf(state.listing, kind);
  return view ? { status: "ready", view, snapshot: state.snapshot } : { status: "failed" };
}
