import { PlanReviewDecisionRequest } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import {
  readRecordedReview,
  reviewMessageOf,
  submitReviewDecision,
  type RecordedReviewDecision,
} from "./review";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("review decisions (7F)", () => {
  it("formats the exact honesty messages for approval and requested changes", () => {
    expect(reviewMessageOf("approved")).toBe(
      "Plan approved (recorded on this case; nothing is sent externally)",
    );
    expect(reviewMessageOf("changes_requested")).toBe(
      "Changes requested (recorded on this case; nothing is sent externally)",
    );
  });

  it("posts to /api/cases/:id/review-decisions and persists the local decision when 404", async () => {
    const storage = memoryStorage();
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url:
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
        body: JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
      });
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    }) as typeof fetch;

    const decision: RecordedReviewDecision = await submitReviewDecision({
      caseId: "case_aitbouguemez",
      briefId: "brief_synthetic_package",
      actionId: "act_synthetic_field_plan",
      caseRevision: 2,
      status: "approved",
      fetcher,
      storage,
      now: "2026-10-31T10:00:00.000Z",
    });

    expect(decision.status).toBe("approved");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/cases/case_aitbouguemez/review-decisions");
    expect(PlanReviewDecisionRequest.parse(calls[0]?.body)).toEqual({
      decision: "approved",
    });
    expect(readRecordedReview("case_aitbouguemez", "brief_synthetic_package", storage)).toEqual(
      decision,
    );
  });

  it("persists changes_requested with an optional reviewer note even when offline", async () => {
    const storage = memoryStorage();
    const fetcher = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const decision = await submitReviewDecision({
      caseId: "case_aitbouguemez",
      briefId: "brief_synthetic_package",
      caseRevision: 2,
      status: "changes_requested",
      note: "Check spring pasture dates with village council first",
      fetcher,
      storage,
      now: "2026-10-31T10:05:00.000Z",
    });

    expect(decision.status).toBe("changes_requested");
    expect(decision.note).toBe("Check spring pasture dates with village council first");
    expect(readRecordedReview("case_aitbouguemez", "brief_synthetic_package", storage)).toEqual(
      decision,
    );
  });
});
