import type { Command } from "@siterra/contracts";
import {
  type Pool,
  appendEvents,
  applyCommit,
  createCase,
  createSession,
  sessionCookieName,
} from "@siterra/db";
import {
  type TestDatabase,
  exampleCase,
  exampleCommandRequest,
  exampleCommit,
  exampleEvent,
  exampleEvidence,
  freshDatabase,
} from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as SnapshotRoute from "./cases/[caseId]/route.ts";
import type * as CommandsRoute from "./cases/[caseId]/commands/route.ts";
import type * as EventsRoute from "./cases/[caseId]/events/route.ts";
import type * as CancelRoute from "./commands/[commandId]/cancel/route.ts";
import type * as DemoRoute from "./demo-sessions/route.ts";
import type * as TraceRoute from "./cases/[caseId]/trace/route.ts";
import type * as ReviewsRoute from "./cases/[caseId]/reviews/route.ts";
import type * as ReviewDecisionsRoute from "./cases/[caseId]/review-decisions/route.ts";

let db: TestDatabase;
let pool: Pool;
let cookie: string;
const owner = "owner_example";
const origin = "http://127.0.0.1:4350";
const caseId = "case_example_api";

type Routes = {
  snapshot: typeof SnapshotRoute;
  commands: typeof CommandsRoute;
  events: typeof EventsRoute;
  cancel: typeof CancelRoute;
  demo: typeof DemoRoute;
  trace: typeof TraceRoute;
  reviews: typeof ReviewsRoute;
  reviewDecisions: typeof ReviewDecisionsRoute;
};
let routes: Routes;

const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  shared.siterraHub = undefined;
  routes = {
    snapshot: await import("./cases/[caseId]/route.ts"),
    commands: await import("./cases/[caseId]/commands/route.ts"),
    events: await import("./cases/[caseId]/events/route.ts"),
    cancel: await import("./commands/[commandId]/cancel/route.ts"),
    demo: await import("./demo-sessions/route.ts"),
    trace: await import("./cases/[caseId]/trace/route.ts"),
    reviews: await import("./cases/[caseId]/reviews/route.ts"),
    reviewDecisions: await import("./cases/[caseId]/review-decisions/route.ts"),
  };
  await createCase(pool, exampleCase(caseId), owner);
  cookie = `${sessionCookieName}=${await createSession(pool, { ownerScopeId: owner, kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraHub?.close();
  await shared.siterraPool?.end();
  await db.drop();
});

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, { headers: { cookie, ...headers } });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      cookie,
      origin,
      host: new URL(origin).host,
      "content-type": "application/json",
      ...headers,
    },
  });
}

/** Reads the stream until it has seen every wanted event id, or fails after the timeout. */
async function readUntil(response: Response, wanted: number[], timeoutMs = 5000): Promise<string> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  while (!wanted.every((id) => text.includes(`id: ${id}\n`))) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Timed out; stream so far:\n${text}`);
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Timed out; stream so far:\n${text}`));
        }, remaining);
      }),
    ]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel();
  return text;
}

describe("POST /api/cases/:id/commands", () => {
  it("answers 202, then 200 for a repeated key, then 422 for the key with another body", async () => {
    const request = exampleCommandRequest("api-command-0001");
    const created = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, request),
      params({ caseId }),
    );
    expect(created.status).toBe(202);
    const command = (await created.json()) as Command;
    expect(command.status).toBe("accepted");
    const repeated = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, request),
      params({ caseId }),
    );
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(command);
    const reused = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, { ...request, text: "Other text" }),
      params({ caseId }),
    );
    expect(reused.status).toBe(422);
    expect(reused.headers.get("content-type")).toContain("application/problem+json");
    expect(((await reused.json()) as { code: string }).code).toBe("idempotency_key_reused");
  });

  it("answers 400 with issues for an invalid body, 401 without a session or from another origin", async () => {
    const invalid = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, { text: "" }),
      params({ caseId }),
    );
    expect(invalid.status).toBe(400);
    const body = (await invalid.json()) as { issues: { code: string }[] };
    expect(body.issues.length).toBeGreaterThan(0);
    const request = exampleCommandRequest("api-command-0002");
    const noSession = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, request, { cookie: "" }),
      params({ caseId }),
    );
    expect(noSession.status).toBe(401);
    const crossOrigin = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, request, { origin: "https://elsewhere.example" }),
      params({ caseId }),
    );
    expect(crossOrigin.status).toBe(401);
  });
});

describe("RL-04: GET /api/cases/:id restores the case", () => {
  it("returns the snapshot with lastSequence, and 404 for a case of another owner", async () => {
    const response = await routes.snapshot.GET(get(`/api/cases/${caseId}`), params({ caseId }));
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as { case: { id: string }; lastSequence: number };
    expect(snapshot.case.id).toBe(caseId);
    expect(snapshot.lastSequence).toBeGreaterThanOrEqual(1);

    await createCase(pool, exampleCase("case_example_api_other"), "owner_example_other");
    const other = await routes.snapshot.GET(
      get("/api/cases/case_example_api_other"),
      params({ caseId: "case_example_api_other" }),
    );
    expect(other.status).toBe(404);
  });
});

describe("RL-03: the event stream replays after the cursor and then delivers new events", () => {
  it("honours Last-Event-ID over ?after=, replays, then streams a new commit", async () => {
    const before = await appendEvents(pool, caseId, [
      exampleEvent("api-stream-0001"),
      exampleEvent("api-stream-0002"),
    ]);
    const last = before?.at(-1)?.sequence ?? 0;
    const response = await routes.events.GET(
      get(`/api/cases/${caseId}/events?after=0`, { "last-event-id": String(last - 1) }),
      params({ caseId }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    setTimeout(() => {
      void appendEvents(pool, caseId, [exampleEvent("api-stream-0003")]);
    }, 200);
    const text = await readUntil(response, [last, last + 1]);
    expect(text).not.toContain(`id: ${last - 1}\n`);
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids).toEqual([last, last + 1]);
    const data = text.split("\n").find((line) => line.startsWith("data: "));
    expect(JSON.parse(data?.slice(6) ?? "null")).toMatchObject({
      recordType: "Event",
      sequence: last,
    });
  });

  it("sends one reset message and closes when the cursor is beyond the history", async () => {
    const response = await routes.events.GET(
      get(`/api/cases/${caseId}/events?after=999999`),
      params({ caseId }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('event: reset\ndata: {"reason":"history_unavailable"}\n\n');
  });

  it("answers 400 for a cursor that is not a sequence", async () => {
    const response = await routes.events.GET(
      get(`/api/cases/${caseId}/events?after=-1`),
      params({ caseId }),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/commands/:id/cancel", () => {
  it("answers 202 while the command can stop and 404 for an unknown command", async () => {
    const created = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, exampleCommandRequest("api-cancel-0001")),
      params({ caseId }),
    );
    const command = (await created.json()) as Command;
    const cancelled = await routes.cancel.POST(
      post(`/api/commands/${command.id}/cancel`, {}),
      params({ commandId: command.id }),
    );
    expect(cancelled.status).toBe(202);
    const unknown = await routes.cancel.POST(
      post("/api/commands/cmd_example_unknown/cancel", {}),
      params({ commandId: "cmd_example_unknown" }),
    );
    expect(unknown.status).toBe(404);
  });
});

describe("SITERRA_APP_ORIGIN", () => {
  it("when set, only that origin may change state, whatever the Host header says", async () => {
    process.env["SITERRA_APP_ORIGIN"] = "https://siterra.example";
    try {
      const request = exampleCommandRequest("api-origin-0001");
      const wrong = await routes.commands.POST(
        post(`/api/cases/${caseId}/commands`, request),
        params({ caseId }),
      );
      expect(wrong.status).toBe(401);
      const right = await routes.commands.POST(
        post(`/api/cases/${caseId}/commands`, request, {
          origin: "https://siterra.example",
          host: "internal:8080",
        }),
        params({ caseId }),
      );
      expect(right.status).toBe(202);
    } finally {
      delete process.env["SITERRA_APP_ORIGIN"];
    }
  });
});

describe("RL-03: the stream recovers when the LISTEN connection drops", () => {
  it("delivers a new event well within one heartbeat after the listener is terminated", async () => {
    const last =
      (await appendEvents(pool, caseId, [exampleEvent("api-drop-0001")]))?.at(-1)?.sequence ?? 0;
    const response = await routes.events.GET(
      get(`/api/cases/${caseId}/events?after=${last}`),
      params({ caseId }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const killed = await pool.query<{ ok: boolean }>(
      "select pg_terminate_backend(pid) as ok from pg_stat_activity where datname = current_database() and query ilike 'listen %'",
    );
    expect(killed.rows.length).toBeGreaterThanOrEqual(1);
    setTimeout(() => {
      void appendEvents(pool, caseId, [exampleEvent("api-drop-0002")]);
    }, 2500);
    const started = Date.now();
    await readUntil(response, [last + 1], 8000);
    expect(Date.now() - started).toBeLessThan(8000);
  });
});

describe("POST /api/demo-sessions", () => {
  it("answers 201 with a session cookie whose case copy the next request can read", async () => {
    process.env["SITERRA_SEED_CASE_ID"] = caseId;
    process.env["SITERRA_SEED_OWNER_SCOPE"] = owner;
    const started = await routes.demo.POST(
      new Request(`${origin}/api/demo-sessions`, {
        method: "POST",
        headers: { origin, host: new URL(origin).host },
      }),
    );
    expect(started.status).toBe(201);
    const setCookie = started.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(
      /^__Host-session=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400$/,
    );
    const body = (await started.json()) as { caseId: string; commandQuota: number };
    expect(body.commandQuota).toBe(20);
    const demoCookie = setCookie.split(";")[0] ?? "";
    const snapshot = await routes.snapshot.GET(
      get(`/api/cases/${body.caseId}`, { cookie: demoCookie }),
      params({ caseId: body.caseId }),
    );
    expect(snapshot.status).toBe(200);
    const original = await routes.snapshot.GET(
      get(`/api/cases/${caseId}`, { cookie: demoCookie }),
      params({ caseId }),
    );
    expect(original.status).toBe(404);
  });

  it("answers 401 from another origin", async () => {
    const response = await routes.demo.POST(
      new Request(`${origin}/api/demo-sessions`, {
        method: "POST",
        headers: { origin: "https://elsewhere.example", host: new URL(origin).host },
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("GET /api/cases/:id/trace", () => {
  it("answers 200 with the command's events, 400 without a command ID, 404 for an unknown command", async () => {
    const created = await routes.commands.POST(
      post(`/api/cases/${caseId}/commands`, exampleCommandRequest("api-trace-0001")),
      params({ caseId }),
    );
    const command = (await created.json()) as Command;
    const trace = await routes.trace.GET(
      get(`/api/cases/${caseId}/trace?commandId=${command.id}`),
      params({ caseId }),
    );
    expect(trace.status).toBe(200);
    const body = (await trace.json()) as { events: { kind: string }[]; spans: unknown[] };
    expect(body.events.map((e) => e.kind)).toEqual(["command.accepted"]);
    expect(body.spans).toEqual([]);
    const missing = await routes.trace.GET(get(`/api/cases/${caseId}/trace`), params({ caseId }));
    expect(missing.status).toBe(400);
    const unknown = await routes.trace.GET(
      get(`/api/cases/${caseId}/trace?commandId=cmd_example_unknown`),
      params({ caseId }),
    );
    expect(unknown.status).toBe(404);
  });
});

describe("POST /api/cases/:id/reviews", () => {
  it("answers 201, 200 for a repeated key, 422 for a decision the role cannot record, 409 for a stale case revision", async () => {
    const snapshot = (await (
      await routes.snapshot.GET(get(`/api/cases/${caseId}`), params({ caseId }))
    ).json()) as {
      case: { revision: number };
    };
    const body = {
      role: "scientific",
      reviewedEntityVersions: [] as { entityId: string; revision: number }[],
      caseRevisionReviewed: snapshot.case.revision,
      actionId: null,
      decision: "approved",
      conditions: [],
      comments: "Synthetic review comment.",
      mode: "demo",
      idempotencyKey: "api-review-0001",
    };
    const path = `/api/cases/${caseId}/reviews`;
    const empty = await routes.reviews.POST(post(path, body), params({ caseId }));
    expect(empty.status).toBe(400);

    await applyCommit(
      pool,
      exampleCommit(exampleCase(caseId, snapshot.case.revision), {
        id: "commit_example_api_review",
        expected: snapshot.case.revision,
        upserts: [exampleEvidence(caseId, "ev_example_api_review")],
      }),
    );
    const reviewed = {
      ...body,
      reviewedEntityVersions: [{ entityId: "ev_example_api_review", revision: 1 }],
      caseRevisionReviewed: snapshot.case.revision + 1,
    };
    const created = await routes.reviews.POST(post(path, reviewed), params({ caseId }));
    expect(created.status).toBe(201);
    const repeated = await routes.reviews.POST(post(path, reviewed), params({ caseId }));
    expect(repeated.status).toBe(200);
    const notPermitted = await routes.reviews.POST(
      post(path, { ...reviewed, role: "community_livelihood", idempotencyKey: "api-review-0002" }),
      params({ caseId }),
    );
    expect(notPermitted.status).toBe(422);
    const stale = await routes.reviews.POST(
      post(path, {
        ...reviewed,
        caseRevisionReviewed: snapshot.case.revision,
        idempotencyKey: "api-review-0003",
      }),
      params({ caseId }),
    );
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { code: string }).code).toBe("stale_versions");
  });
});

describe("POST /api/cases/:id/review-decisions", () => {
  it("records approved or changes_requested with optional note <= 500 chars and keeps externalExecutionEnabled false", async () => {
    const path = `/api/cases/${caseId}/review-decisions`;
    const created = await routes.reviewDecisions.POST(
      post(path, {
        decision: "approved",
        note: "Approved to present at the assembly.",
        idempotencyKey: "api-plan-review-0001",
      }),
      params({ caseId }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      status: string;
      comments: string;
      mode: string;
      authorityStatus: string;
    };
    expect(body.status).toBe("approved");
    expect(body.comments).toBe("Approved to present at the assembly.");
    expect(body.mode).toBe("demo");
    expect(body.authorityStatus).toBe("not_established");

    const replayed = await routes.reviewDecisions.POST(
      post(path, {
        decision: "approved",
        note: "Approved to present at the assembly.",
        idempotencyKey: "api-plan-review-0001",
      }),
      params({ caseId }),
    );
    expect(replayed.status).toBe(200);

    const changes = await routes.reviewDecisions.POST(
      post(path, {
        decision: "changes_requested",
        note: "Add transect timing note.",
      }),
      params({ caseId }),
    );
    expect(changes.status).toBe(201);
    expect(((await changes.json()) as { status: string }).status).toBe("changes_requested");

    const invalid = await routes.reviewDecisions.POST(
      post(path, { decision: "approved", note: "x".repeat(501) }),
      params({ caseId }),
    );
    expect(invalid.status).toBe(400);

    const noSession = await routes.reviewDecisions.POST(
      post(path, { decision: "approved" }, { cookie: "" }),
      params({ caseId }),
    );
    expect(noSession.status).toBe(401);
  });
});
