// PF-05 (platform part): the server acknowledges a command within 1 s, and command.accepted reaches
// an open event stream within 1 s of the request. Measured in-process on the local database with the
// real seed case; the demo laptop and the deployment are measured separately. The first real
// progress event (within 2 s) needs the worker and is not part of this test.
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import type { Command } from "@siterra/contracts";
import {
  type Pool,
  createSession,
  loadSeedCase,
  readCaseSeed,
  sessionCookieName,
} from "@siterra/db";
import { type TestDatabase, exampleCommandRequest, freshDatabase } from "@siterra/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as CommandsRoute from "./cases/[caseId]/commands/route.ts";
import type * as EventsRoute from "./cases/[caseId]/events/route.ts";

const owner = "owner_example_ack";
const origin = "http://127.0.0.1:4350";
const repoDir = fileURLToPath(new URL("../../../../", import.meta.url));
/** The PF-05 acknowledgement budget, in milliseconds. */
const ackBudgetMs = 1000;

let db: TestDatabase;
let cookie = "";
let caseId = "";
let routes: { commands: typeof CommandsRoute; events: typeof EventsRoute };
const shared = globalThis as typeof globalThis & {
  siterraPool?: Pool;
  siterraHub?: { close: () => Promise<void> };
};

beforeAll(async () => {
  db = await freshDatabase();
  process.env["DATABASE_URL"] = db.url;
  shared.siterraPool = undefined;
  shared.siterraHub = undefined;
  routes = {
    commands: await import("./cases/[caseId]/commands/route.ts"),
    events: await import("./cases/[caseId]/events/route.ts"),
  };
  const { seed } = readCaseSeed({
    repoDir,
    ownerScopeId: owner,
    importedAt: "2026-10-27T20:00:00Z",
  });
  if (seed === null) throw new Error("A pinned seed file does not match");
  await loadSeedCase(db.pool, seed, owner);
  caseId = seed.caseRecord.id;
  cookie = `${sessionCookieName}=${await createSession(db.pool, { ownerScopeId: owner, kind: "local", ttlSeconds: 3600 })}`;
});

afterAll(async () => {
  await shared.siterraHub?.close();
  await shared.siterraPool?.end();
  await db.drop();
});

/** Resolves with the time when the stream delivers a command.accepted event for commandId. */
function acceptedOnStream(response: Response, commandId: () => string | null): Promise<number> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  return (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Stream ended before command.accepted:\n${text}`);
      text += decoder.decode(chunk.value, { stream: true });
      const id = commandId();
      for (const line of text.split("\n")) {
        if (id === null || !line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6)) as { kind?: string; commandId?: string };
        if (event.kind === "command.accepted" && event.commandId === id) {
          const at = performance.now();
          await reader.cancel();
          return at;
        }
      }
    }
  })();
}

describe("PF-05 (platform part): command acknowledgement within 1 s, measured locally", () => {
  it("answers 202 and streams command.accepted within the budget, five commands in a row", async () => {
    const measured: { ackMs: number; streamMs: number }[] = [];
    for (let i = 1; i <= 5; i++) {
      const stream = await routes.events.GET(
        new Request(`${origin}/api/cases/${caseId}/events?after=1`, { headers: { cookie } }),
        { params: Promise.resolve({ caseId }) },
      );
      expect(stream.status).toBe(200);
      let commandId: string | null = null;
      const accepted = acceptedOnStream(stream, () => commandId);
      const started = performance.now();
      const response = await routes.commands.POST(
        new Request(`${origin}/api/cases/${caseId}/commands`, {
          method: "POST",
          body: JSON.stringify(exampleCommandRequest(`ack-key-000${String(i)}`)),
          headers: {
            cookie,
            origin,
            host: new URL(origin).host,
            "content-type": "application/json",
          },
        }),
        { params: Promise.resolve({ caseId }) },
      );
      const ackMs = performance.now() - started;
      expect(response.status).toBe(202);
      commandId = ((await response.json()) as Command).id;
      const streamMs = (await accepted) - started;
      measured.push({ ackMs, streamMs });
    }
    process.stdout.write(
      `PF-05 local measurements (ms): ${measured
        .map((m) => `ack ${m.ackMs.toFixed(1)}, stream ${m.streamMs.toFixed(1)}`)
        .join("; ")}\n`,
    );
    for (const m of measured) {
      expect(m.ackMs).toBeLessThan(ackBudgetMs);
      expect(m.streamMs).toBeLessThan(ackBudgetMs);
    }
  });
});
