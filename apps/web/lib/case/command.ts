// The commission: the request the interface sends to start the investigation, built from one case
// revision and checked against the shared contract before it leaves (POST /api/cases/:id/commands).

import { CommandRequest, type CaseSnapshot, type Command } from "@siterra/contracts";

/** A command bound to the revision and the analysis area the viewer saw. */
export function commissionRequest(
  s: CaseSnapshot,
  text: string,
  idempotencyKey: string,
): CommandRequest {
  const g = s.records.geoSelectionRecords.find((x) => x.id === s.case.activeGeoSelectionId);
  return CommandRequest.parse({
    text,
    intent: "commission",
    context: {
      caseRevision: s.case.revision,
      geoSelectionId: g?.id ?? null,
      geoRevision: g?.revision ?? null,
      periodIds: [],
      focusedEntityIds: [],
      dataBundleIds: s.records.dataBundleRecords
        .filter((b) => b.status === "validated")
        .map((b) => b.id),
      locale: "en",
    },
    expectedCaseRevision: s.case.revision,
    idempotencyKey,
  });
}

export type SubmitResult =
  | { status: "accepted"; command: Command }
  | { status: "refused"; httpStatus: number; code: string | null };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function submitCommand(
  caseId: string,
  body: CommandRequest,
  fetchImpl: Fetch,
): Promise<SubmitResult> {
  const res = await fetchImpl(`/api/cases/${encodeURIComponent(caseId)}/commands`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 202 || res.status === 200)
    return { status: "accepted", command: (await res.json()) as Command };
  const code = await res
    .json()
    .then((b: unknown) => (b as { code?: string }).code ?? null)
    .catch(() => null);
  return { status: "refused", httpStatus: res.status, code };
}
