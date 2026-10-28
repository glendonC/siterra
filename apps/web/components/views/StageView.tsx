"use client";

// The arrival on its own (the /stage route): the case and the map bundle open, then the valley and its
// chrome.

import { CaseNotice } from "../case/CaseNotice";
import { useArrivalCase } from "../case/useArrivalCase";
import { useMapBundle } from "../map/useMapBundle";
import { ArrivalView } from "./ArrivalView";

export function StageView() {
  const c = useArrivalCase();
  const map = useMapBundle();
  if (c.status === "opening" || map.status === "loading") return null;
  if (c.status === "not_found") return <CaseNotice message="case.notFound" />;
  if (c.status === "failed") return <CaseNotice message="case.failed" />;
  if (c.arrival.kind !== "ready")
    return <CaseNotice badge="case.coverageRequired" message="case.noBoundary" />;
  return (
    <ArrivalView
      assets={map.status === "ready" ? map.bundle.valley : null}
      contourArea={map.status === "ready" ? map.bundle.contours : undefined}
      settle
      arrival={c.arrival}
      snapshot={c.snapshot}
    />
  );
}
