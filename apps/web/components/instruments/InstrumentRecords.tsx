"use client";

// The case records the instruments draw: the case the valley opens (?case=, or the visitor's demo copy of the seed
// case) and its instrument specs from GET /api/cases/:id/instruments, opened once per page and shared by the
// instruments inside the shell. A page can be handed records instead (the lane's preview), or the case it has
// already opened (the journey at "/"), so only the listing is read and no second demo session starts.

import type { CaseSnapshot, InstrumentListing, InstrumentView } from "@siterra/contracts";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  instrumentOf,
  loadInstruments,
  openInstruments,
  type CaseInstruments,
} from "../../lib/instruments/listing";
import { viewerStorage } from "../../lib/shell/preferences";

export type InstrumentRecordsState =
  | { status: "opening" }
  | { status: "ready"; snapshot: CaseSnapshot; listing: InstrumentListing }
  | { status: "failed" };

const Records = createContext<InstrumentRecordsState>({ status: "opening" });
/** Reopens the listing for a newer case revision (the overview, after its request commits). */
const Refresh = createContext<(snapshot: CaseSnapshot) => void>(() => undefined);

/** One open per page: an effect that runs twice (React's development check) shares the first request. */
let opening: Promise<CaseInstruments> | undefined;
/** The listing of a case already open, once per case revision. */
const listings = new Map<string, Promise<CaseInstruments>>();

function listingOf(snapshot: CaseSnapshot): Promise<CaseInstruments> {
  const key = `${snapshot.case.id}@${String(snapshot.case.revision)}`;
  let p = listings.get(key);
  if (!p) {
    p = loadInstruments(
      snapshot.case.id,
      (input, init) => fetch(input, init),
      snapshot.case.revision,
    ).then((r) => (r.status === "ready" ? { status: "ready", snapshot, listing: r.listing } : r));
    listings.set(key, p);
  }
  return p;
}

export function InstrumentRecords({
  records,
  snapshot,
  children,
}: {
  records?: { snapshot: CaseSnapshot; listing: InstrumentListing };
  /** The case the page has already opened: only its instrument listing is read. */
  snapshot?: CaseSnapshot;
  children: ReactNode;
}) {
  const [state, setState] = useState<InstrumentRecordsState>(
    records ? { status: "ready", ...records } : { status: "opening" },
  );
  useEffect(() => {
    if (records) return;
    let live = true;
    const caseId = new URLSearchParams(window.location.search).get("case") ?? undefined;
    const open = snapshot
      ? listingOf(snapshot)
      : (opening ??= openInstruments(
          caseId,
          (input, init) => fetch(input, init),
          viewerStorage(),
          Date.now(),
        ));
    open
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
  }, [records, snapshot]);
  const refresh = useCallback((snapshot: CaseSnapshot) => {
    const revision = snapshot.case.revision;
    loadInstruments(snapshot.case.id, (input, init) => fetch(input, init), revision)
      .then((r) => {
        if (r.status !== "ready") {
          console.error("Instrument records could not be reopened", r);
          return;
        }
        // a newer revision already held stays
        setState((held) =>
          held.status === "ready" && held.snapshot.case.revision > revision
            ? held
            : { status: "ready", snapshot, listing: r.listing },
        );
      })
      .catch((e: unknown) => {
        console.error("Instrument records could not be reopened", e);
      });
  }, []);
  return (
    <Records.Provider value={state}>
      <Refresh.Provider value={refresh}>{children}</Refresh.Provider>
    </Records.Provider>
  );
}

/** Reopens the case's records for a newer snapshot: its instrument listing as of that revision. */
export function useRecordsRefresh(): (snapshot: CaseSnapshot) => void {
  return useContext(Refresh);
}

export type InstrumentRecord =
  | { status: "opening" }
  | { status: "ready"; view: InstrumentView; snapshot: CaseSnapshot }
  // the case is open and holds no ready spec of this kind
  | { status: "absent"; snapshot: CaseSnapshot }
  | { status: "failed" };

/** The ready spec of one instrument kind, with the case it belongs to. */
export function useInstrument(
  kind: InstrumentView["spec"]["parameters"]["kind"],
): InstrumentRecord {
  const state = useContext(Records);
  if (state.status !== "ready") return state;
  const view = instrumentOf(state.listing, kind);
  return view
    ? { status: "ready", view, snapshot: state.snapshot }
    : { status: "absent", snapshot: state.snapshot };
}

/** Why the composer opened no instrument of a kind, in its own words, when the listing says so. */
export function useBlockedReasons(kind: InstrumentView["spec"]["parameters"]["kind"]): string[] {
  const state = useContext(Records);
  if (state.status !== "ready") return [];
  const blocked = state.listing.blocked;
  return (blocked ?? []).filter((b) => b.kind === kind).flatMap((b) => b.reasons);
}

/** The case records the page opened: the snapshot and its whole instrument listing (the overview's findings). */
export function useInstrumentRecords(): InstrumentRecordsState {
  return useContext(Records);
}
