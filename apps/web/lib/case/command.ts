// The commission: the request the interface sends to start the investigation, built from one case
// revision and checked against the shared contract before it leaves (POST /api/cases/:id/commands).

import { CommandRequest, type CaseSnapshot, type Command } from "@siterra/contracts";

/** What the request asks: the viewer's own words when they typed any, else the case question. */
export function requestText(typed: string | undefined, objective: string): string {
  const t = typed?.trim() ?? "";
  return t === "" ? objective : t;
}

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
  | {
      status: "refused";
      httpStatus: number;
      code: string | null;
      /**
       * Whose limit refused it, for quota_exhausted: the instance's spend cap or this demo session's commands. The
       * problem's code is the same for both; its detail names the instance only for the instance's cap.
       */
      limit?: "instance" | "session";
    };

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
  type Problem = { code?: string; detail?: string };
  const problem: Problem = await res
    .json()
    .then((b: unknown) => b as Problem)
    .catch((): Problem => ({}));
  const code = problem.code ?? null;
  if (code !== "quota_exhausted") return { status: "refused", httpStatus: res.status, code };
  const limit = /\binstance\b/i.test(problem.detail ?? "") ? "instance" : "session";
  return { status: "refused", httpStatus: res.status, code, limit };
}
