// TR-03 at the browser boundary: what the API ships (the snapshot, the event stream, the trace and
// problem bodies) is scanned for API keys, bearer tokens, the database URL, trace content keys and
// prompt or reasoning fields, on the real seed case with a command, its events and its spans.
import { fileURLToPath } from "node:url";
import type { Command } from "@siterra/contracts";
import {
  type Pool,
  SpanRejected,
  appendEvents,
  contentAttributeKeys,
  createSession,
  loadSeedCase,
  readCaseSeed,
  recordSpan,
  sessionCookieName,
} from "@siterra/db";
import {
  type TestDatabase,
  exampleCommandRequest,
  exampleEvent,
  freshDatabase,
} from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as SnapshotRoute from "./cases/[caseId]/route.ts";
import type * as CommandsRoute from "./cases/[caseId]/commands/route.ts";
import type * as EventsRoute from "./cases/[caseId]/events/route.ts";
import type * as TraceRoute from "./cases/[caseId]/trace/route.ts";

// A key-shaped value in the form the Model API uses (LLM_<id>_<secret>); not a real key.
const plantedKey = "LLM_1234567_plantedNotARealKey0000";
const owner = "owner_example_boundary";
const origin = "http://127.0.0.1:4350";
const repoDir = fileURLToPath(new URL("../../../../", import.meta.url));

/** Everything the scan refuses in a body shipped to the browser, with a name for the failure. */
function findings(text: string, databaseUrl: string): string[] {
  const checks: [string, RegExp | string][] = [
    ["Model API key form", /LLM_\d+_[A-Za-z0-9]/],
    ["bearer token", /Bearer\s+\S/i],
    ["planted key", plantedKey],
    ["database URL", databaseUrl],
    [
      "prompt or reasoning field",
      /"(system_?[Pp]rompt|system_instructions|prompt|reasoning|reasoning_content|thinking)"\s*:/,
    ],
    ...contentAttributeKeys.map((key): [string, string] => [`content key ${key}`, key]),
  ];
  return checks
    .filter(([, pattern]) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
    )
    .map(([name]) => name);
}

let db: TestDatabase;
let pool: Pool;
let cookie = "";
let caseId = "";
let routes: {
  snapshot: typeof SnapshotRoute;
  commands: typeof CommandsRoute;
  events: typeof EventsRoute;
  trace: typeof TraceRoute;
};
const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  process.env["DATABASE_URL"] = db.url;
  process.env["MODEL_API_KEY"] = plantedKey;
  shared.siterraPool = undefined;
  shared.siterraHub = undefined;
  routes = {
    snapshot: await import("./cases/[caseId]/route.ts"),
    commands: await import("./cases/[caseId]/commands/route.ts"),
    events: await import("./cases/[caseId]/events/route.ts"),
    trace: await import("./cases/[caseId]/trace/route.ts"),
  };
  const { seed } = readCaseSeed({
    repoDir,
    ownerScopeId: owner,
    importedAt: "2026-10-27T20:00:00Z",
  });
  if (seed === null) throw new Error("A pinned seed file does not match");
  await loadSeedCase(pool, seed, owner);
  caseId = seed.caseRecord.id;
  cookie = `${sessionCookieName}=${await createSession(pool, { ownerScopeId: owner, kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  delete process.env["MODEL_API_KEY"];
  await shared.siterraHub?.close();
  await shared.siterraPool?.end();
  await db.drop();
});

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function request(path: string, init: RequestInit = {}, withCookie = true): Request {
  return new Request(`${origin}${path}`, {
    ...init,
    headers: {
      ...(withCookie ? { cookie } : {}),
      origin,
      host: new URL(origin).host,
      "content-type": "application/json",
    },
  });
}

/** Reads the stream until the given event id has arrived. */
async function readStreamTo(response: Response, lastId: number): Promise<string> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 5000;
  while (!text.includes(`id: ${lastId}\n`) && Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel();
  return text;
}

describe("TR-03 (browser boundary): no key, token, database URL, content key or prompt field is shipped", () => {
  it("the scan itself flags each kind it looks for", () => {
    expect(findings(`{"a":"${plantedKey}"}`, db.url)).toContain("Model API key form");
    expect(findings("Authorization: Bearer abc.def", db.url)).toContain("bearer token");
    expect(findings(`{"note":"${db.url}"}`, db.url)).toContain("database URL");
    expect(findings('{"system_prompt": "x"}', db.url)).toContain("prompt or reasoning field");
    expect(findings('{"gen_ai.input.messages":1}', db.url)).toContain(
      "content key gen_ai.input.messages",
    );
    expect(findings('{"text":"rainfall below normal"}', db.url)).toEqual([]);
  });

  it("scans the snapshot, the stream, the trace and problem bodies of a seeded case with a command", async () => {
    const created = await routes.commands.POST(
      request(`/api/cases/${caseId}/commands`, {
        method: "POST",
        body: JSON.stringify(exampleCommandRequest("boundary-key-0001")),
      }),
      params({ caseId }),
    );
    expect(created.status).toBe(202);
    const command = (await created.json()) as Command;
    const appended = await appendEvents(pool, caseId, [
      { ...exampleEvent("boundary-progress-0001"), commandId: command.id },
    ]);
    await recordSpan(pool, {
      caseId,
      taskId: null,
      traceId: command.id,
      spanId: "span-boundary-model",
      parentSpanId: null,
      name: "chat example-model",
      kind: "CLIENT",
      startedAt: "2026-10-27T20:00:00.000Z",
      endedAt: "2026-10-27T20:00:01.000Z",
      status: "ok",
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "example-model",
        "gen_ai.usage.input_tokens": 120,
        "siterra.command_id": command.id,
      },
    });
    // The storage guard refuses a content attribute before anything can reach the trace route.
    await expect(
      recordSpan(pool, {
        caseId,
        taskId: null,
        traceId: command.id,
        spanId: "span-boundary-content",
        parentSpanId: null,
        name: "chat example-model",
        kind: "CLIENT",
        startedAt: "2026-10-27T20:00:00.000Z",
        endedAt: null,
        status: "unset",
        attributes: { "gen_ai.input.messages": `Authorization: Bearer ${plantedKey}` },
      }),
    ).rejects.toBeInstanceOf(SpanRejected);

    const bodies: [string, string][] = [];
    const snapshot = await routes.snapshot.GET(request(`/api/cases/${caseId}`), params({ caseId }));
    expect(snapshot.status).toBe(200);
    bodies.push(["snapshot", await snapshot.text()]);
    const stream = await routes.events.GET(
      request(`/api/cases/${caseId}/events?after=0`),
      params({ caseId }),
    );
    const lastId = appended?.at(-1)?.sequence ?? 0;
    const streamed = await readStreamTo(stream, lastId);
    expect(streamed).toContain(`id: ${lastId}\n`);
    bodies.push(["event stream", streamed]);
    const trace = await routes.trace.GET(
      request(`/api/cases/${caseId}/trace?commandId=${command.id}`),
      params({ caseId }),
    );
    const traceText = await trace.text();
    expect(traceText).toContain("span-boundary-model");
    expect(traceText).not.toContain("span-boundary-content");
    bodies.push(["trace", traceText]);
    for (const [name, response] of [
      [
        "401",
        await routes.snapshot.GET(request(`/api/cases/${caseId}`, {}, false), params({ caseId })),
      ],
      [
        "404",
        await routes.snapshot.GET(
          request("/api/cases/case_unknown"),
          params({ caseId: "case_unknown" }),
        ),
      ],
      ["400", await routes.trace.GET(request(`/api/cases/${caseId}/trace`), params({ caseId }))],
      [
        "400 invalid command body",
        await routes.commands.POST(
          request(`/api/cases/${caseId}/commands`, { method: "POST", body: '{"text":1}' }),
          params({ caseId }),
        ),
      ],
    ] as const) {
      expect(String(response.status)).toBe(name.split(" ")[0]);
      bodies.push([`problem ${name}`, await response.text()]);
    }

    const found = bodies.flatMap(([name, text]) =>
      findings(text, db.url).map((finding) => `${name}: ${finding}`),
    );
    expect(found).toEqual([]);
    expect(bodies.map(([name, text]) => [name, text.length > 0])).toEqual(
      bodies.map(([name]) => [name, true]),
    );
  });
});
