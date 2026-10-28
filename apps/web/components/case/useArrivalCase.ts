"use client";

// Opens one case for the arrival: the case named in the URL (?case=), or the visitor's demo copy of the
// seed case, started before any case request when there is none (openCase), and projects it. The projection is kept in state, so the stage gets
// the same geometry object for the whole revision.

import { useEffect, useState } from "react";
import type { CaseSnapshot } from "@siterra/contracts";
import { openCase, type CaseLoad } from "../../lib/case/load";
import { viewerStorage } from "../../lib/shell/preferences";
import { projectArrival, type ArrivalProjection } from "../../lib/projection/arrival";

/**
 * One open per page and case: an effect that runs twice (React's development check) shares the first
 * request instead of starting a second demo session.
 */
const opening = new Map<string, Promise<CaseLoad>>();

function openOnce(caseId: string | undefined): Promise<CaseLoad> {
  const key = caseId ?? "";
  let p = opening.get(key);
  if (!p) {
    p = openCase(caseId, (input, init) => fetch(input, init), viewerStorage(), Date.now());
    opening.set(key, p);
  }
  return p;
}

export type ArrivalCase =
  | { status: "opening" }
  // resumed: the visitor has been here, so the page goes back to their case (openCase)
  | { status: "ready"; arrival: ArrivalProjection; snapshot: CaseSnapshot; resumed: boolean }
  | { status: "not_found" }
  | { status: "failed" };

export function useArrivalCase(): ArrivalCase {
  const [state, setState] = useState<ArrivalCase>({ status: "opening" });
  useEffect(() => {
    let live = true;
    const caseId = new URLSearchParams(window.location.search).get("case") ?? undefined;
    openOnce(caseId)
      .then((r) => {
        if (!live) return;
        if (r.status === "ready")
          setState({
            status: "ready",
            arrival: projectArrival(r.snapshot),
            snapshot: r.snapshot,
            resumed: r.resumed === true,
          });
        else if (r.status === "not_found" || r.status === "unauthenticated")
          setState({ status: "not_found" });
        else {
          console.error("Case could not be opened", r);
          setState({ status: "failed" });
        }
      })
      .catch((e: unknown) => {
        console.error("Case could not be opened", e);
        if (live) setState({ status: "failed" });
      });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
