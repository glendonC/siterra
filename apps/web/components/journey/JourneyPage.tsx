"use client";

// Loads the map bundle (the globe's and the valley's assets) and the case, then runs the sequence. A
// visitor who has been here goes straight back to their case at the arrival.

import { en } from "../../lib/copy/en";
import { CaseNotice } from "../case/CaseNotice";
import { useArrivalCase } from "../case/useArrivalCase";
import { useMapBundle } from "../map/useMapBundle";
import { ArrivalView } from "../views/ArrivalView";
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
  if (c.resumed)
    return (
      <ArrivalView
        assets={map.bundle.valley}
        contourArea={map.bundle.contours}
        settle
        arrival={c.arrival}
        snapshot={c.snapshot}
      />
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
