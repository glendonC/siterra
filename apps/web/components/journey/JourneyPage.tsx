"use client";

// Loads the map bundle (the globe's and the valley's assets) and the case, then runs the sequence. A
// visitor who has been here goes straight back to their case on the overview (approved specimen D4), with the
// case already open, so only its instrument listing is read.

import { en } from "../../lib/copy/en";
import { CaseNotice } from "../case/CaseNotice";
import { useArrivalCase } from "../case/useArrivalCase";
import { useMapBundle } from "../map/useMapBundle";
import { InstrumentRecords } from "../instruments/InstrumentRecords";
import { ValleyOverview } from "../overview/ValleyOverview";
import { Journey } from "./Journey";

export function JourneyPage() {
  const map = useMapBundle();
  const c = useArrivalCase();
  if (map.status === "failed") return <p role="alert">{en["stage.mapFailed"].text}</p>;
  if (c.status === "not_found") return <CaseNotice message="case.notFound" />;
  if (c.status === "failed") return <CaseNotice message="case.failed" />;
  if (map.status === "loading" || c.status === "opening") return null;
  if (c.arrival.kind !== "ready")
    return <CaseNotice badge="case.coverageRequired" message="case.noBoundary" />;
  // the Siterra crumb (?start) shows the opening even to a visitor who has been here
  if (c.resumed && !new URLSearchParams(window.location.search).has("start"))
    return (
      <InstrumentRecords snapshot={c.snapshot}>
        <ValleyOverview />
      </InstrumentRecords>
    );
  return (
    <Journey
      valleyAssets={map.bundle.valley}
      contourArea={map.bundle.contours}
      globeAssets={map.bundle.globe}
      arrival={c.arrival}
      snapshot={c.snapshot}
    />
  );
}
