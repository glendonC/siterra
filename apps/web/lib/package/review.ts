// Plan review decisions in demo mode: an approval or a request for changes (with an optional short reviewer note),
// posted to /api/cases/:id/review-decisions. Nothing counts as recorded until the case accepts it: a refused or
// offline request records nothing, here or on the case.

import type { PlanReviewDecisionRequest } from "@siterra/contracts";
import { pkg } from "../copy/package";
import type { PackageView } from "./package";

export type ReviewChoice = "approved" | "changes_requested";

export interface RecordedReviewDecision {
  caseId: string;
  briefId: string;
  actionId: string | null;
  status: ReviewChoice;
  note: string;
  decidedAt: string;
}

export function reviewStorageKey(caseId: string, briefId: string): string {
  return `siterra.reviewDecision.${caseId}.${briefId}`;
}

export function reviewMessageOf(status: ReviewChoice): string {
  return status === "approved" ? pkg["review.approved"].text : pkg["review.changesRequested"].text;
}

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecordedReview(
  caseId: string,
  briefId: string,
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): RecordedReviewDecision | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(reviewStorageKey(caseId, briefId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecordedReviewDecision>;
    if (
      parsed.caseId === caseId &&
      parsed.briefId === briefId &&
      (parsed.status === "approved" || parsed.status === "changes_requested") &&
      typeof parsed.note === "string" &&
      typeof parsed.decidedAt === "string"
    ) {
      return {
        caseId,
        briefId,
        actionId: typeof parsed.actionId === "string" ? parsed.actionId : null,
        status: parsed.status,
        note: parsed.note,
        decidedAt: parsed.decidedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeRecordedReview(
  decision: RecordedReviewDecision,
  storage: Pick<Storage, "setItem"> | null = defaultStorage(),
): void {
  if (storage) {
    try {
      storage.setItem(
        reviewStorageKey(decision.caseId, decision.briefId),
        JSON.stringify(decision),
      );
    } catch {
      // Ignore storage quota or private-mode errors; in-memory state still updates.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("siterra:review-decision", { detail: decision }));
  }
}

export function viewRecordedReview(
  caseId: string,
  view: PackageView,
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): RecordedReviewDecision | null {
  const local = readRecordedReview(caseId, view.briefId, storage);
  if (local) return local;
  const fromRecord = view.reviews
    .filter((r) => r.status === "approved" || r.status === "changes_requested")
    .at(-1);
  if (!fromRecord) return null;
  return {
    caseId,
    briefId: view.briefId,
    actionId: null,
    status: fromRecord.status === "approved" ? "approved" : "changes_requested",
    note: "",
    decidedAt: "",
  };
}

export async function submitReviewDecision({
  caseId,
  briefId,
  actionId = null,
  status,
  note = "",
  fetcher = typeof fetch !== "undefined" ? (i, init) => fetch(i, init) : undefined,
  storage = defaultStorage(),
  now = new Date().toISOString(),
}: {
  caseId: string;
  briefId: string;
  actionId?: string | null;
  caseRevision?: number;
  status: ReviewChoice;
  note?: string;
  fetcher?: typeof fetch;
  storage?: Pick<Storage, "setItem"> | null;
  now?: string;
}): Promise<RecordedReviewDecision | null> {
  const trimmedNote = note.trim().slice(0, 500);
  const decision: RecordedReviewDecision = {
    caseId,
    briefId,
    actionId,
    status,
    note: trimmedNote,
    decidedAt: now,
  };
  if (!fetcher) return null;
  const payload: PlanReviewDecisionRequest = {
    decision: status,
    ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
  };
  try {
    const res = await fetcher(`/api/cases/${encodeURIComponent(caseId)}/review-decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
  } catch {
    return null;
  }
  // the case accepted it: only now is the decision recorded
  writeRecordedReview(decision, storage);
  return decision;
}
