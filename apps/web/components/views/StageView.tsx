"use client";

// The arrival on its own (the /stage route): the case opens, then the valley and its chrome.

import { CaseNotice } from "../case/CaseNotice";
import { useArrivalCase } from "../case/useArrivalCase";
import { ArrivalView } from "./ArrivalView";

export function StageView({ manifestUrl }: { manifestUrl: string }) {
  const c = useArrivalCase();
  if (c.status === "opening") return null;
  if (c.status === "not_found") return <CaseNotice message="case.notFound" />;
  if (c.status === "failed") return <CaseNotice message="case.failed" />;
  if (c.arrival.kind !== "ready") return <CaseNotice message="case.noBoundary" />;
  return <ArrivalView manifestUrl={manifestUrl} arrival={c.arrival} snapshot={c.snapshot} />;
}
