import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { commissionRequest, requestText, submitCommand } from "./command";

const snapshot = CaseSnapshot.parse(seed);

describe("requestText", () => {
  it("sends what the viewer typed, trimmed, and the case question only when the box is empty", () => {
    expect(requestText("  Has the valley floor changed since 2019?  ", "Case question")).toBe(
      "Has the valley floor changed since 2019?",
    );
    expect(requestText("   ", "Case question")).toBe("Case question");
    expect(requestText(undefined, "Case question")).toBe("Case question");
  });
});

describe("commissionRequest", () => {
  it("binds the command to the revision, the area and the validated bundles the viewer saw", () => {
    const r = commissionRequest(snapshot, snapshot.case.objective, "key-0000001");
    expect(r.intent).toBe("commission");
    expect(r.expectedCaseRevision).toBe(snapshot.case.revision);
    expect(r.context.geoSelectionId).toBe("geo_ait_bouguemez_catchment");
    expect(r.context.dataBundleIds).toHaveLength(20);
  });

  it("refuses a key the contract does not accept", () => {
    expect(() => commissionRequest(snapshot, "x", "short")).toThrow();
  });
});

describe("submitCommand", () => {
  it("returns the accepted command, or the refusal code", async () => {
    const body = commissionRequest(snapshot, "q", "key-0000001");
    const ok = await submitCommand("c", body, () =>
      Promise.resolve(new Response(JSON.stringify({ id: "cmd_1" }), { status: 202 })),
    );
    expect(ok.status).toBe("accepted");
    const no = await submitCommand("c", body, () =>
      Promise.resolve(new Response(JSON.stringify({ code: "quota_exhausted" }), { status: 429 })),
    );
    expect(no).toEqual({
      status: "refused",
      httpStatus: 429,
      code: "quota_exhausted",
      limit: "session",
    });
    // the instance's spend cap answers with the same code and names the instance in its detail
    const capped = await submitCommand("c", body, () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: "quota_exhausted",
            detail:
              "This instance has reached its limit for live model questions. Try again later.",
          }),
          { status: 429 },
        ),
      ),
    );
    expect(capped).toMatchObject({ status: "refused", limit: "instance" });
    const other = await submitCommand("c", body, () =>
      Promise.resolve(new Response(JSON.stringify({ code: "invalid_request" }), { status: 400 })),
    );
    expect(other).toEqual({ status: "refused", httpStatus: 400, code: "invalid_request" });
  });
});
