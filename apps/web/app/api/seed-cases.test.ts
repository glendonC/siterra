import { type Pool, createCase } from "@siterra/db";
import { type TestDatabase, exampleCase, freshDatabase } from "@siterra/db/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type * as SnapshotRoute from "./cases/[caseId]/route.ts";
import type * as DemoRoute from "./demo-sessions/route.ts";
import type * as SeedCasesRoute from "./seed-cases/route.ts";

// P7a: the listing of seed cases a visitor can start, and a demo session on a chosen one.

let db: TestDatabase;
let pool: Pool;
let demo: typeof DemoRoute;
let seedCases: typeof SeedCasesRoute;
let snapshot: typeof SnapshotRoute;
const origin = "http://127.0.0.1:4350";
const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};
const place = { name: "Beta creek", region: "Beta hills, Betaland" };

beforeAll(async () => {
  db = await freshDatabase();
  pool = db.pool;
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  shared.siterraHub = undefined;
  demo = await import("./demo-sessions/route.ts");
  seedCases = await import("./seed-cases/route.ts");
  snapshot = await import("./cases/[caseId]/route.ts");
  const at = "2026-10-30T10:00:00Z";
  await createCase(
    pool,
    { ...exampleCase("case_example_first"), title: "First case", createdAt: at, updatedAt: at },
    "seed",
  );
  await createCase(
    pool,
    {
      ...exampleCase("case_example_second"),
      title: "Second case",
      objective: "Is the second place changing?",
      place,
      createdAt: "2026-10-30T11:00:00Z",
      updatedAt: "2026-10-30T11:00:00Z",
    },
    "seed",
  );
  process.env["SITERRA_SEED_CASE_ID"] = "case_example_first";
  process.env["SITERRA_SEED_OWNER_SCOPE"] = "seed";
});

afterAll(async () => {
  delete process.env["SITERRA_SEED_CASE_ID"];
  delete process.env["SITERRA_SEED_OWNER_SCOPE"];
  await shared.siterraHub?.close();
  await shared.siterraPool?.end();
  await db.drop();
});

afterEach(() => {
  process.env["SITERRA_SEED_CASE_ID"] = "case_example_first";
});

const headers = { origin, host: new URL(origin).host };
function start(body?: string): Promise<Response> {
  return demo.POST(
    new Request(`${origin}/api/demo-sessions`, {
      method: "POST",
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      ...(body === undefined ? {} : { body }),
    }),
  );
}
async function copyTitle(started: Response): Promise<string | undefined> {
  const { caseId } = (await started.json()) as { caseId: string };
  const cookie = (started.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const read = await snapshot.GET(
    new Request(`${origin}/api/cases/${caseId}`, { headers: { cookie, ...headers } }),
    { params: Promise.resolve({ caseId }) },
  );
  return ((await read.json()) as { case: { title: string } }).case.title;
}

describe("GET /api/seed-cases", () => {
  it("lists every seed case with its place, question and outlet, and names the default, for a visitor with no session", async () => {
    const response = await seedCases.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      defaultCaseId: string | null;
      cases: { caseId: string; title: string; question: string; place: unknown; outlet: unknown }[];
    };
    expect(body.defaultCaseId).toBe("case_example_first");
    expect(body.cases.map((c) => c.caseId)).toEqual(["case_example_first", "case_example_second"]);
    expect(body.cases[1]).toEqual({
      caseId: "case_example_second",
      title: "Second case",
      question: "Is the second place changing?",
      place,
      outlet: null,
    });
    expect(body.cases[0]?.place).toBeNull();
  });

  it("names no default when the configured default is not a seed case", async () => {
    process.env["SITERRA_SEED_CASE_ID"] = "case_example_gone";
    const body = (await (await seedCases.GET()).json()) as {
      defaultCaseId: string | null;
    };
    expect(body.defaultCaseId).toBeNull();
  });
});

describe("POST /api/demo-sessions with a chosen seed case", () => {
  it("starts on the configured default when no case is chosen, with no body or an empty object", async () => {
    expect(await copyTitle(await start())).toBe("First case");
    expect(await copyTitle(await start("{}"))).toBe("First case");
  });

  it("starts on the chosen seed case", async () => {
    const started = await start(JSON.stringify({ seedCaseId: "case_example_second" }));
    expect(started.status).toBe(201);
    expect(await copyTitle(started)).toBe("Second case");
  });

  it("refuses a case that is not in the listing, with a plain 400 and no session", async () => {
    const before = await pool.query("select count(*) as n from sessions where kind = 'demo'");
    for (const chosen of ["case_example_nope", "case_example_second_copy"]) {
      const refused = await start(JSON.stringify({ seedCaseId: chosen }));
      expect(refused.status).toBe(400);
      expect(refused.headers.get("set-cookie")).toBeNull();
      expect(((await refused.json()) as { code: string }).code).toBe("invalid_request");
    }
    const after = await pool.query("select count(*) as n from sessions where kind = 'demo'");
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("refuses a demo copy chosen as a seed case", async () => {
    const copy = (await (await start()).json()) as { caseId: string };
    expect((await start(JSON.stringify({ seedCaseId: copy.caseId }))).status).toBe(400);
  });

  it("refuses a body that is not JSON, has another key, or names a case that is not text", async () => {
    for (const body of ["not json", '{"seedCaseId":7}', '{"other":1}', "[]", '{"seedCaseId":""}']) {
      expect((await start(body)).status).toBe(400);
    }
  });
});
