// When a field check lit on the land is done, in its plan's own words ("Spring, before the upper pastures open"): the
// season of the check in the latest action whose field plan names it, as the answer's checks come from that plan
// (lib/readout/readout.ts). The land's place label says the place and this, never the check's number.

import type { CaseSnapshot } from "@siterra/contracts";

/** The check's season as its plan writes it; null for no check id, or no plan that names the check. */
export function checkSeasonOf(snapshot: CaseSnapshot, fieldCheckId: string | null): string | null {
  if (!fieldCheckId) return null;
  const actions = [...snapshot.records.operationalActionRecords].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  for (const a of actions) {
    const m = a.fieldPlan?.measurements.find((x) => x.fieldCheckId === fieldCheckId);
    if (m) return m.season;
  }
  return null;
}
