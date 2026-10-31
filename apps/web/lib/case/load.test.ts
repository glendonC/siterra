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

/**
 * A server with one demo copy per POST; any other case answers 401 (no session). It knows the seed cases in `seeds`
 * and refuses a POST naming another (400), as the route does.
 */
function server(
  calls: string[],
  known: string[] = [],
  seeds = ["case_aitbouguemez", "case_calaveras_creek"],
) {
  let n = 0;
  return (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? ` ${init.body}` : "";
    calls.push(`${init?.method ?? "GET"} ${url}${body}`);
    if (url === "/api/demo-sessions") {
      const named = body ? (JSON.parse(body) as { seedCaseId?: string }).seedCaseId : undefined;
      if (named !== undefined && !seeds.includes(named)) return Promise.resolve(reply(400));
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
      'POST /api/demo-sessions {"seedCaseId":"case_aitbouguemez"}',
      "GET /api/cases/case_demo_1",
    ]);
    expect(r.status).toBe("ready");
    expect(r.status === "ready" && r.resumed).toBe(false);
  });

  it("opens a named second place as its own demo copy, and comes back to that copy while it lasts (U25)", async () => {
    const calls: string[] = [];
    const known: string[] = [];
    const storage = memoryStorage();
    await openCase("case_calaveras_creek", server(calls, known), storage, NOW);
    expect(calls).toEqual([
      "GET /api/cases/case_calaveras_creek",
      'POST /api/demo-sessions {"seedCaseId":"case_calaveras_creek"}',
      "GET /api/cases/case_demo_1",
    ]);
    calls.length = 0;
    const again = await openCase(
      "case_calaveras_creek",
      server(calls, known),
      storage,
      NOW + 60_000,
    );
    expect(calls).toEqual(["GET /api/cases/case_demo_1"]);
    expect(again.status === "ready" && again.resumed).toBe(true);
  });

  it("opens a named place's own copy when the visitor's session holds another place's copy (404, not 401)", async () => {
    const calls: string[] = [];
    // a session that reads only its own copy: any other case is not found
    let n = 0;
    const own: string[] = [];
    const sessioned = (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? ` ${init.body}` : "";
      calls.push(`${init?.method ?? "GET"} ${url}${body}`);
      if (url === "/api/demo-sessions") {
        n += 1;
        own.push(`case_demo_${String(n)}`);
        return Promise.resolve(
          reply(201, { caseId: `case_demo_${String(n)}`, expiresAt: "2026-10-27T23:00:00Z" }),
        );
      }
      const id = url.split("/").pop() ?? "";
      return Promise.resolve(own.includes(id) ? reply(200, seed) : reply(404));
    };
    const r = await openCase("case_calaveras_creek", sessioned, memoryStorage(), NOW);
    expect(calls).toEqual([
      "GET /api/cases/case_calaveras_creek",
      'POST /api/demo-sessions {"seedCaseId":"case_calaveras_creek"}',
      "GET /api/cases/case_demo_1",
    ]);
    expect(r.status).toBe("ready");
  });

  it("does not let a copy of one place stand in for another place named in the address", async () => {
    const calls: string[] = [];
    const known: string[] = [];
    const storage = memoryStorage();
    await openCase(undefined, server(calls, known), storage, NOW);
    calls.length = 0;
    await openCase("case_calaveras_creek", server(calls, known), storage, NOW);
    expect(calls).toContain('POST /api/demo-sessions {"seedCaseId":"case_calaveras_creek"}');
  });

  it("opens the default copy when the named case is neither readable nor a seed case", async () => {
    const calls: string[] = [];
    const r = await openCase("case_demo_gone", server(calls), memoryStorage(), NOW);
    expect(calls).toEqual([
      "GET /api/cases/case_demo_gone",
      'POST /api/demo-sessions {"seedCaseId":"case_demo_gone"}',
      "POST /api/demo-sessions",
      "GET /api/cases/case_demo_1",
    ]);
    expect(r.status).toBe("ready");
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
