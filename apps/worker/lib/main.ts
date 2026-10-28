import { fileURLToPath } from "node:url";

import { chooseTransport, describeRoute, readKeychainKey } from "@siterra/agent";
import { createPool, planQueue } from "@siterra/db";
import { startWorkerHeartbeat } from "@siterra/db/health";
import type { Pool } from "@siterra/db";
import { dispatchOutboxToJobs, jobSchema } from "@siterra/db/job-queue";
import { newId } from "@siterra/domain";
import { PgBoss } from "pg-boss";

import { corpusPaths, corpusWarning, loadCorpus } from "./corpus.ts";
import { loadAnalyses } from "./recipes.ts";
import { workerDb } from "./db.ts";
import { handlePlanJob } from "./plan-job.ts";
import type { PlanJob } from "./plan-job.ts";

// The worker process: dispatch the outbox into pg-boss and run plan jobs. Each job's ID is derived
// from its outbox job key (PLATFORM's dispatchOutboxToJobs), so a crash between enqueueing and
// marking the row dispatched only repeats an insert pg-boss ignores; a singleton key would not
// prevent that on a standard queue (AUDIT a44). The model route comes from the environment (replay unless GATE-01 approval and the
// key are both present); the key is never printed.

/**
 * How often the worker looks for new work (PF-05: first progress within 2 s). The outbox pass runs
 * every 250 ms and pg-boss polls the plan queue every 0.5 s, its minimum; at 1 s and pg-boss's
 * default 2 s, first progress took 2.9 s (PLATFORM 36 measurement).
 */
export const WORKER_TIMING = {
  outboxPollMs: 250,
  jobPollingIntervalSeconds: 0.5,
} as const;

/** One pass of the outbox into pg-boss; returns the number of rows handed over. */
export function dispatchOnce(pool: Pool, boss: PgBoss): Promise<number> {
  return dispatchOutboxToJobs(pool, boss);
}

/** pg-boss on the schema migrate.ts installed; pg-boss never migrates it at start. */
export function workerQueue(connectionString: string): PgBoss {
  return new PgBoss({ connectionString, schema: jobSchema, migrate: false });
}

/** An error's code, else its name: what a log line may carry about it. */
export function errorLabel(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
    if (error instanceof Error) return error.name;
  }
  return "unknown error";
}

function isPlanJob(data: unknown): data is PlanJob {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["caseId"] === "string" &&
    typeof d["commandId"] === "string" &&
    typeof d["planTaskId"] === "string"
  );
}

/**
 * SIGINT and SIGTERM stop gracefully: pg-boss lets the running job finish. SIGUSR2 is the spend
 * guard's stop: it aborts the running command first (in-flight model calls included, the command
 * ends cancelled with cause spend_guard), then stops the worker.
 */
export function installStopSignals(
  target: { once(event: string, listener: () => void): unknown },
  spendGuard: AbortController,
  stop: () => Promise<void>,
): void {
  let stopping = false;
  const stopOnce = (): void => {
    if (stopping) return;
    stopping = true;
    void stop();
  };
  for (const signal of ["SIGINT", "SIGTERM"]) target.once(signal, stopOnce);
  target.once("SIGUSR2", () => {
    console.error("worker: spend guard stop: cancelling the running command");
    spendGuard.abort();
    stopOnce();
  });
}

export async function startWorker(
  env: NodeJS.ProcessEnv = process.env,
  options: { spendStop?: AbortSignal } = {},
): Promise<() => Promise<void>> {
  const url = env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const { repoRoot, manifest, textRoot } = corpusPaths(env, process.cwd());
  // On the live route without MODEL_API_KEY the key is read from the login Keychain into memory.
  const transport = chooseTransport(env, { readKeychain: (service) => readKeychainKey(service) });
  console.log(`worker: model route ${describeRoute(transport).label}`);

  const pool = createPool(url);
  const db = workerDb(pool);
  const boss = workerQueue(url);
  boss.on("error", (error: unknown) => {
    console.error(
      `worker: job queue error: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  });
  await boss.start();
  await boss.createQueue(planQueue);
  // The health check reads this worker as alive from its heartbeat (AUDIT B b36).
  // A failed beat logs its code or name only, never a message that could carry connection text
  // (AUDIT B b54).
  const stopHeartbeat = await startWorkerHeartbeat(pool, (error: unknown) => {
    console.error(`worker: heartbeat failed: ${errorLabel(error)}`);
  });

  await boss.work<PlanJob>(
    planQueue,
    { pollingIntervalSeconds: WORKER_TIMING.jobPollingIntervalSeconds },
    async (jobs) => {
      for (const job of jobs) {
        if (!isPlanJob(job.data)) throw new Error(`job ${job.id} has no plan payload`);
        const snapshot = await db.readSnapshot(job.data.caseId);
        const revisions = new Map(
          (snapshot?.records.sourceRecords ?? []).map((s) => [s.id, s.revision]),
        );
        const corpus = await loadCorpus(
          repoRoot,
          manifest,
          (id) => revisions.get(id) ?? null,
          textRoot,
        );
        const unreadable = corpusWarning(corpus, textRoot);
        if (unreadable) console.error(unreadable);
        const analyses = await loadAnalyses(repoRoot, snapshot?.records.dataBundleRecords ?? []);
        if (analyses.missing.length > 0) {
          console.error(`worker: recipe results not readable: ${analyses.missing.join(", ")}`);
        }
        const result = await handlePlanJob(job.data, {
          db,
          transport,
          corpus,
          analyses,
          now: () => new Date(),
          newId: (prefix) => newId(prefix),
          ...(options.spendStop ? { spendStop: options.spendStop } : {}),
        });
        const stopped =
          result.status === "ran" && result.outcome.stopReason
            ? ` (${result.outcome.stopReason})`
            : "";
        console.log(
          `worker: plan job ${job.data.commandId} ${result.status === "ran" ? result.outcome.status : `skipped (${result.reason})`}${stopped}`,
        );
      }
    },
  );

  let stopping = false;
  const dispatch = setInterval(() => {
    if (stopping) return;
    void dispatchOnce(pool, boss).catch((error: unknown) => {
      console.error(
        `worker: outbox dispatch failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });
  }, WORKER_TIMING.outboxPollMs);

  return async () => {
    stopping = true;
    clearInterval(dispatch);
    stopHeartbeat();
    await boss.stop();
    await pool.end();
  };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const spendGuard = new AbortController();
  const stop = await startWorker(process.env, { spendStop: spendGuard.signal });
  installStopSignals(process, spendGuard, () => stop().then(() => process.exit(0)));
}
