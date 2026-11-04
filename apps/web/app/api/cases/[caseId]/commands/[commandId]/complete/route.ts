import { readFile } from "node:fs/promises";
import type { CaseSnapshot, Command, EntityVersion } from "@siterra/contracts";
import {
  type CaseAssetFile,
  type Pool,
  appendEvents,
  applyCommit,
  inTransaction,
  isCancelRequested,
  readInstruments,
  readSnapshot,
  resolveBundleAsset,
  resolveCaseAsset,
  setCommandStatus,
} from "@siterra/db";
import { newId } from "@siterra/domain";
import { caseFindings, type ViewLeads } from "../../../../../../../lib/ask/findings.ts";
import { leadSourcesOf, loadViewLeads } from "../../../../../../../lib/ask/leads.ts";
import { selectFindings } from "../../../../../../../lib/ask/select.ts";
import { bandLimitsOf } from "../../../../../../../lib/land/record.ts";
import {
  type FollowUpStatus,
  type ModelCall,
  commandCompletedEvent,
  commandHash,
  followUpCommit,
  followUpEvents,
  followUpTask,
  followUpTaskId,
  noAnswerCode,
  observedFetch,
} from "../../../../../../../lib/live-place/follow-up.ts";
import { resolveLlmConfig } from "../../../../../../../lib/live-place/llm-reasoner.ts";
import { findingsFrom } from "../../../../../../../lib/overview/findings.ts";
import { readoutOf } from "../../../../../../../lib/readout/readout.ts";
import { bundlesDir } from "../../../../../bundles-dir.ts";
import { database } from "../../../../../database.ts";
import { json, problem } from "../../../../../problem.ts";
import { fromApplicationOrigin, requestSession } from "../../../../../session.ts";

export const dynamic = "force-dynamic";

/**
 * Takes the command for this route: still accepted, of a case the session owns, and with no plan job handed to the
 * worker yet. Its undispatched plan job is withdrawn in the same transaction, so the worker never runs it as well.
 * Null when the command is not this route's to run.
 */
async function claimCommand(
  db: Pool,
  args: { caseId: string; commandId: string; ownerScopeId: string },
): Promise<Command | null> {
  return inTransaction(db, async (tx) => {
    const jobs = await tx.query<{ dispatched: boolean }>(
      "select dispatched_at is not null as dispatched from outbox where command_id = $1 for update",
      [args.commandId],
    );
    if (jobs.rows.some((job) => job.dispatched)) return null;
    const claimed = await tx.query<{ record: Command }>(
      `update commands c
       set status = 'running', record = jsonb_set(c.record, '{status}', '"running"'), updated_at = now()
       from cases k
       where c.id = $1 and c.case_id = $2 and k.id = c.case_id and k.owner_scope_id = $3
         and c.status = 'accepted'
       returning c.record`,
      [args.commandId, args.caseId, args.ownerScopeId],
    );
    const command = claimed.rows[0]?.record;
    if (command === undefined) return null;
    await tx.query("delete from outbox where command_id = $1 and dispatched_at is null", [
      args.commandId,
    ]);
    return command;
  });
}

/**
 * The bundle files the views' leads are read from (lib/ask/leads.ts), served from the bundles folder as the read API
 * serves them: a case asset by its bundle, content hash and path, or a bundle asset of the case by its key, each only
 * when its bytes match the checksum its bundle's collection lists. Any other address is not found.
 */
function bundleFiles(dir: string, snap: CaseSnapshot): typeof globalThis.fetch {
  const fileOf = (path: readonly string[]): CaseAssetFile | null => {
    if (path[0] !== "api") return null;
    if (path[1] === "case-assets") {
      const [bundleId = "", contentHash = "", ...rest] = path.slice(2);
      return resolveCaseAsset(dir, { bundleId, contentHash, assetPath: rest.join("/") });
    }
    if (path[1] !== "cases" || path[3] !== "bundles" || path[5] !== "assets") return null;
    const bundle = snap.records.dataBundleRecords.find(
      (b) => b.id === path[4] && b.status === "validated",
    );
    if (!bundle?.contentHash) return null;
    const found = resolveBundleAsset(dir, {
      bundleId: bundle.id,
      contentHash: bundle.contentHash,
      assetKey: path[6] ?? "",
    });
    return found.status === "available" ? found.file : null;
  };
  return async (input) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(href, "http://bundles.invalid").pathname
      .split("/")
      .slice(1)
      .map(decodeURIComponent);
    const file = fileOf(path);
    if (file === null) return new Response(null, { status: 404 });
    return new Response(await readFile(file.absolutePath), {
      status: 200,
      headers: { "Content-Type": file.contentType, ETag: `"${file.checksum}"` },
    });
  };
}

/**
 * Completes a question typed in the Ask once its command is accepted: claims the command, lists the case's own
 * findings (lib/ask/findings.ts), asks the model once which of them answer the question (lib/ask/select.ts), and
 * commits one task that names the chosen findings' records in the answer's order (lib/live-place/follow-up.ts). It
 * writes no Source, Evidence, branch, merge or brief, and keeps nothing the model writes.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string; commandId: string }> },
): Promise<Response> {
  const { caseId, commandId } = await context.params;
  const session = fromApplicationOrigin(request) ? await requestSession(request) : null;
  if (session === null) {
    return problem(401, "unauthenticated");
  }

  const db = database();
  const command = await claimCommand(db, {
    caseId,
    commandId,
    ownerScopeId: session.ownerScopeId,
  });
  if (command === null) {
    return json({ status: "skipped" }, 200);
  }
  try {
    return await complete(db, { caseId, command, ownerScopeId: session.ownerScopeId });
  } catch {
    // a claimed command never stays running: it ends failed, so the ask stops waiting for it
    await setCommandStatus(db, commandId, "failed", []);
    await appendEvents(db, caseId, [
      commandCompletedEvent(commandId, "failed", [], new Date().toISOString()),
    ]);
    return problem(500, "internal_error");
  }
}

async function complete(
  db: Pool,
  args: { caseId: string; command: Command; ownerScopeId: string },
): Promise<Response> {
  const { caseId, command } = args;
  const commandId = command.id;
  const startedAt = new Date().toISOString();
  const snap = await readSnapshot(db, caseId, args.ownerScopeId);
  if (!snap) {
    throw new Error(`Case ${caseId} is not readable`);
  }
  const placeName = snap.case.place?.name ?? snap.case.title;
  const hash = commandHash(commandId);
  const taskId = followUpTaskId(hash);

  /** Commits the task with its outcome (a task that did not succeed names no record), then ends the command. */
  const finish = async (outcome: {
    status: FollowUpStatus;
    failureCode?: string;
    call?: ModelCall;
    chosen?: readonly EntityVersion[];
  }): Promise<Response> => {
    const now = new Date().toISOString();
    const record = (status: FollowUpStatus, failureCode: string | null) => {
      const chosen = status === "succeeded" ? (outcome.chosen ?? []) : [];
      const task = followUpTask({
        caseId,
        commandId,
        question: command.text,
        taskId,
        hash,
        startedAt,
        now,
        status,
        failureCode,
        chosen,
      });
      return followUpCommit({
        id: newId("commit"),
        caseRecord: snap.case,
        commandId,
        taskId,
        now,
        inputVersions: task.inputVersions,
        upserts: [task],
        events: followUpEvents({
          commandId,
          taskId,
          placeName,
          startedAt,
          now,
          status,
          failureCode,
          call: outcome.call ?? null,
          chosen: chosen.length,
        }),
      });
    };

    let status = outcome.status;
    let committed = await applyCommit(db, record(status, outcome.failureCode ?? null));
    if (committed.status === "stale") {
      // a record a chosen finding is built from changed after it was read: the answer is not kept, and the task says why
      status = "failed";
      committed = await applyCommit(db, record(status, "stale_inputs"));
    }
    if (committed.status === "stale" || committed.status === "not_found") {
      throw new Error(`The follow-up commit was ${committed.status}`);
    }
    const revision =
      committed.status === "committed"
        ? committed.commit.newCaseRevision
        : committed.newCaseRevision;
    await setCommandStatus(db, commandId, status, [taskId]);
    await appendEvents(db, caseId, [
      commandCompletedEvent(commandId, status, [taskId], new Date().toISOString()),
    ]);
    return json(
      { status: status === "succeeded" ? "completed" : status, commandId, revision },
      200,
    );
  };

  if (await isCancelRequested(db, commandId)) {
    return finish({ status: "cancelled" });
  }
  const config = resolveLlmConfig();
  if (config === null) {
    return finish({ status: "failed", failureCode: "model_not_configured" });
  }

  // the case's findings, worded as its answer column and its views word them; a view is read from the case's own
  // bundles, and none is offered without the bundles folder
  const dir = bundlesDir();
  const listing = await readInstruments(db, {
    caseId,
    ownerScopeId: args.ownerScopeId,
    bundlesDir: dir,
  });
  const column = readoutOf(snap, listing ? findingsFrom(snap, listing).findings : [], "", {
    limits: bandLimitsOf(snap),
  });
  const leads: ViewLeads =
    listing && dir ? await loadViewLeads(leadSourcesOf(snap), listing, bundleFiles(dir, snap)) : {};
  const findings = caseFindings(
    snap,
    {
      answer: column.answer,
      verdicts: column.verdicts,
      checks: column.ground?.checks ?? [],
      mergeId: column.mergeId,
    },
    leads,
  );
  // nothing to choose from: no model call, and the answer is that the case holds no finding yet
  if (findings.length === 0) {
    return finish({ status: "succeeded", chosen: [] });
  }

  const transport = observedFetch((input, init) => globalThis.fetch(input, init));
  const callStart = Date.now();
  const chosen = await selectFindings({
    question: command.text,
    placeName,
    findings,
    config,
    fetchImpl: transport.fetch,
  });
  const callEnd = Date.now();
  const call: ModelCall = {
    model: config.model,
    startedAt: new Date(callStart).toISOString(),
    endedAt: new Date(callEnd).toISOString(),
    durationMs: callEnd - callStart,
    answered: chosen !== null,
    transport: transport.report(),
  };

  if (await isCancelRequested(db, commandId)) {
    return finish({ status: "cancelled", call });
  }
  if (chosen === null) {
    return finish({ status: "failed", failureCode: noAnswerCode(call.transport), call });
  }
  return finish({ status: "succeeded", call, chosen: chosen.map((f) => f.key) });
}
