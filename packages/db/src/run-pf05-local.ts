// PF-05 over HTTP, local only: the server acknowledges a command within 1 s and the first progress
// event after command.accepted reaches the stream within 2 s. It runs the built web app (pnpm
// build:web first) and the worker on the replay route against a database on this machine:
//   DATABASE_URL=postgres://...@127.0.0.1:.../db node packages/db/src/run-pf05-local.ts [port]
// It refuses any database or web address that is not a loopback host, so it never runs against a
// deployment. The replay is synthetic; this times the platform and the worker loop, not a model.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { readCaseSeed } from "./case-seed.ts";
import { createPool } from "./client.ts";
import { migrate } from "./migrate.ts";
import { loadSeedCase } from "./seed.ts";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const ackBudgetMs = 1000;
const progressBudgetMs = 2000;
const seedOwner = "seed";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const port = Number(process.argv[2] ?? "4353");
const base = `http://127.0.0.1:${String(port)}`;
const databaseUrl = process.env["DATABASE_URL"] ?? "";

function refuse(message: string): never {
  console.error(message);
  process.exit(2);
}

if (!Number.isInteger(port) || port < 1024) refuse("usage: run-pf05-local.ts [port]");
if (!loopback.has(new URL(base).hostname)) refuse("the web address must be a loopback host");
if (databaseUrl === "" || !loopback.has(new URL(databaseUrl).hostname)) {
  refuse("DATABASE_URL must name a database on this machine (127.0.0.1, localhost or ::1)");
}
if (!existsSync(`${repoDir}apps/web/.next/BUILD_ID`))
  refuse("build the web app first: pnpm build:web");

const pool = createPool(databaseUrl);
const children: ChildProcess[] = [];

function start(script: string, env: Record<string, string>): ChildProcess {
  const child = spawn("pnpm", [script], {
    cwd: repoDir,
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  return child;
}

function stopAll(): void {
  for (const child of children) {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already ended
      }
    }
  }
}

async function waitFor(check: () => Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

try {
  await migrate(pool);
  const { seed, issues } = readCaseSeed({
    repoDir,
    ownerScopeId: seedOwner,
    importedAt: new Date().toISOString(),
  });
  if (seed === null || issues.length > 0) throw new Error("the case seed did not load cleanly");
  const present = await pool.query("select 1 from cases where id = $1 and owner_scope_id = $2", [
    seed.caseRecord.id,
    seedOwner,
  ]);
  if (present.rowCount === 0) await loadSeedCase(pool, seed, seedOwner);

  start("start:web", {
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    SITERRA_BIND_HOST: "127.0.0.1",
  });
  await waitFor(async () => (await fetch(`${base}/api/health`)).ok, "the web app");
  const worker = start("start:worker", {
    DATABASE_URL: databaseUrl,
    SITERRA_MODEL_ROUTE: "replay",
    SITERRA_REPLAY_FILE: `${repoDir}apps/worker/fixtures/seed-commission.synthetic.replay.json`,
  });
  let workerLog = "";
  worker.stdout?.on("data", (chunk: Buffer) => (workerLog += chunk.toString("utf8")));
  await waitFor(() => Promise.resolve(workerLog.includes("worker: model route")), "the worker");

  const headers = { origin: base, "content-type": "application/json" };
  const demo = await fetch(`${base}/api/demo-sessions`, { method: "POST", headers });
  if (demo.status !== 201) throw new Error(`demo session: ${String(demo.status)}`);
  const cookie = (demo.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const { caseId } = (await demo.json()) as { caseId: string };
  const snapshot = (await (
    await fetch(`${base}/api/cases/${caseId}`, { headers: { cookie } })
  ).json()) as {
    lastSequence: number;
    case: { revision: number };
  };

  const stream = await fetch(
    `${base}/api/cases/${caseId}/events?after=${String(snapshot.lastSequence)}`,
    {
      headers: { cookie },
    },
  );
  const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
  // Written by the stream reader as events arrive; an object so each read sees the latest value.
  const seen: {
    commandId: string | null;
    accepted: number | null;
    progress: { at: number; kind: string } | null;
  } = { commandId: null, accepted: null, progress: null };
  const reading = (async () => {
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      text += decoder.decode(chunk.value, { stream: true });
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ") || seen.commandId === null) continue;
        const event = JSON.parse(line.slice(6)) as { kind?: string; commandId?: string };
        if (event.commandId !== seen.commandId) continue;
        if (event.kind === "command.accepted") seen.accepted ??= performance.now();
        else seen.progress ??= { at: performance.now(), kind: event.kind ?? "" };
      }
      if (seen.progress !== null) return;
    }
  })();

  const started = performance.now();
  const response = await fetch(`${base}/api/cases/${caseId}/commands`, {
    method: "POST",
    headers: { ...headers, cookie },
    body: JSON.stringify({
      text: "What do the catchment vegetation and rainfall records show for spring 2022?",
      intent: "commission",
      context: {
        caseRevision: snapshot.case.revision,
        geoSelectionId: null,
        geoRevision: null,
        periodIds: [],
        focusedEntityIds: [],
        dataBundleIds: [],
        locale: "en",
      },
      expectedCaseRevision: snapshot.case.revision,
      idempotencyKey: `pf05-local-${String(Date.now())}`,
    }),
  });
  const ackMs = performance.now() - started;
  if (response.status !== 202) throw new Error(`command: ${String(response.status)}`);
  seen.commandId = ((await response.json()) as { id: string }).id;
  await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  await reader.cancel();

  const acceptedMs = seen.accepted === null ? null : seen.accepted - started;
  const progress = seen.progress;
  const progressMs = progress === null ? null : progress.at - started;
  const passed = ackMs < ackBudgetMs && progressMs !== null && progressMs < progressBudgetMs;
  console.log(
    [
      `PF-05 local (replay, synthetic; ${base}):`,
      `acknowledged ${ackMs.toFixed(0)} ms (budget ${String(ackBudgetMs)})`,
      `command.accepted on the stream ${acceptedMs === null ? "not seen" : `${acceptedMs.toFixed(0)} ms`}`,
      `first progress ${progressMs === null || progress === null ? "not seen" : `${progressMs.toFixed(0)} ms (${progress.kind})`} (budget ${String(progressBudgetMs)})`,
      passed ? "PASS" : "FAIL",
    ].join("; "),
  );
  process.exitCode = passed ? 0 : 1;
} finally {
  stopAll();
  await pool.end();
}
