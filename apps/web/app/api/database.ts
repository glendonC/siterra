import { type Pool, EventHub, createPool } from "@siterra/db";

// One pool and one LISTEN connection per server process, kept on globalThis so development
// reloads do not open new ones.
const shared = globalThis as typeof globalThis & { siterraPool?: Pool; siterraHub?: EventHub };

export function database(): Pool {
  shared.siterraPool ??= createPool();
  return shared.siterraPool;
}

export function eventHub(): EventHub {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL is not set");
  }
  shared.siterraHub ??= new EventHub(connectionString);
  return shared.siterraHub;
}
