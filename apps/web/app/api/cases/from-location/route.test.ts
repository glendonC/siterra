import { afterEach, describe, expect, it, vi } from "vitest";

// the case is never really built here: ingest is a stub that records its calls
const ingest = vi.fn(() => Promise.resolve({ caseId: "case_loc_test_abc123", created: true }));
vi.mock("../../../../lib/live-place/ingest.ts", () => ({ ingestLocationCase: ingest }));
vi.mock("../../database.ts", () => ({ database: () => ({}) }));

const { POST } = await import("./route");

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://127.0.0.1/api/cases/from-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  ingest.mockClear();
});

describe("starting a case from a picked point", () => {
  it("refuses open water, with no land in the case's box, and builds nothing", async () => {
    const res = await post({ lon: -19.35, lat: 13.31, question: "What covers the land here?" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; detail: string };
    expect(body.code).toBe("invalid_request");
    expect(body.detail).toMatch(/open water/);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("builds a case on land", async () => {
    const res = await post({ lon: 33.75, lat: 21.88 });
    expect(res.status).toBe(201);
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it("builds a case on a coast, where the box holds some land", async () => {
    const res = await post({ lon: -17.44, lat: 14.69 });
    expect(res.status).toBe(201);
    expect(ingest).toHaveBeenCalledTimes(1);
  });
});
