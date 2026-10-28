import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { loadSnapshot, openCase } from "./load";

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("loadSnapshot", () => {
  it("returns the seed snapshot parsed by the shared contract", async () => {
    const r = await loadSnapshot("case_aitbouguemez", () => Promise.resolve(reply(200, seed)));
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.snapshot.case.mode).toBe("concept");
  });

  it("refuses a body that is not a case snapshot", async () => {
    const r = await loadSnapshot("x", () => Promise.resolve(reply(200, { case: {} })));
    expect(r.status).toBe("invalid");
  });

  it("reports missing sessions and cases as such", async () => {
    expect((await loadSnapshot("x", () => Promise.resolve(reply(401)))).status).toBe(
      "unauthenticated",
    );
    expect((await loadSnapshot("x", () => Promise.resolve(reply(404)))).status).toBe("not_found");
    expect(await loadSnapshot("x", () => Promise.resolve(reply(503)))).toEqual({
      status: "failed",
      httpStatus: 503,
    });
  });
});

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => {
      m.clear();
    },
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

const NOW = Date.parse("2026-10-27T22:00:00Z");

/** A server with one demo copy per POST; any other case answers 401 (no session). */
function server(calls: string[], known: string[] = []) {
  let n = 0;
  return (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/demo-sessions") {
      n += 1;
      known.push(`case_demo_${String(n)}`);
      return Promise.resolve(
        reply(201, { caseId: `case_demo_${String(n)}`, expiresAt: "2026-10-27T23:00:00Z" }),
      );
    }
    const id = url.split("/").pop() ?? "";
    return Promise.resolve(known.includes(id) ? reply(200, seed) : reply(401));
  };
}

describe("openCase", () => {
  it("starts a demo session before the first case request for a new visitor, so nothing answers 401", async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    const r = await openCase(undefined, server(calls), storage, NOW);
    expect(calls).toEqual(["POST /api/demo-sessions", "GET /api/cases/case_demo_1"]);
    expect(r.status).toBe("ready");
    expect(r.status === "ready" && r.resumed).toBe(false);
  });

  it("goes back to the visitor's own demo copy while it lasts", async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    const known: string[] = [];
    await openCase(undefined, server(calls, known), storage, NOW);
    calls.length = 0;
    const r = await openCase(undefined, server(calls, known), storage, NOW + 60_000);
    expect(calls).toEqual(["GET /api/cases/case_demo_1"]);
    expect(r.status).toBe("ready");
    // a returning visitor: the page goes back to their case, not to the opening
    expect(r.status === "ready" && r.resumed).toBe(true);
  });

  it("starts a new demo copy once the stored one has expired", async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    await openCase(undefined, server(calls), storage, NOW);
    calls.length = 0;
    await openCase(undefined, server(calls), storage, Date.parse("2026-10-28T00:00:00Z"));
    expect(calls[0]).toBe("POST /api/demo-sessions");
  });

  it("opens a named case directly, and falls back to a demo copy without a session", async () => {
    const calls: string[] = [];
    const r = await openCase("case_aitbouguemez", server(calls), memoryStorage(), NOW);
    expect(calls).toEqual([
      "GET /api/cases/case_aitbouguemez",
      "POST /api/demo-sessions",
      "GET /api/cases/case_demo_1",
    ]);
    expect(r.status).toBe("ready");
    expect(r.status === "ready" && r.resumed).toBe(false);
  });

  it("still opens a case when storage is blocked", async () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const r = await openCase(undefined, server([]), blocked, NOW);
    expect(r.status).toBe("ready");
  });
});

describe("openCase for a visitor whose session can read the named case", () => {
  it("reports the case as resumed", async () => {
    const r = await openCase("case_demo_7", server([], ["case_demo_7"]), memoryStorage(), NOW);
    expect(r.status === "ready" && r.resumed).toBe(true);
  });
});
