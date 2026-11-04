import { readFileSync } from "node:fs";
import type { Command, Evidence, Source } from "@siterra/contracts";
import {
  type Pool,
  appendEvents,
  applyCommit,
  inTransaction,
  isCancelRequested,
  readSnapshot,
  setCommandStatus,
} from "@siterra/db";
import { newId } from "@siterra/domain";
import {
  type HistoricalClimateSummary,
  MIN_COMPLETE_YEARS,
  OPEN_METEO_SOURCE,
  computeStatsFromAnnual,
  unavailableClimate,
} from "../../../../../../../lib/live-place/climate-series.ts";
import { fetchRegionalContextAndGovernance } from "../../../../../../../lib/live-place/context-fetcher.ts";
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
  verifiedFindingEvidence,
} from "../../../../../../../lib/live-place/follow-up.ts";
import { fetchGovernmentPolicyAndOpenAccess } from "../../../../../../../lib/live-place/government-policy-fetcher.ts";
import { fetchOpenAlexSources } from "../../../../../../../lib/live-place/literature.ts";
import { terrainCachePath } from "../../../../../../../lib/live-place/terrain-builder.ts";
import {
  reasonOverCaseWithLlm,
  resolveLlmConfig,
} from "../../../../../../../lib/live-place/llm-reasoner.ts";
import { database } from "../../../../../database.ts";
import { json, problem } from "../../../../../problem.ts";
import { fromApplicationOrigin, requestSession } from "../../../../../session.ts";

export const dynamic = "force-dynamic";

/** The elevation span of the place's terrain grid, or null when no terrain file is cached for the case. */
function terrainSpan(caseId: string): { minElevationM: number; maxElevationM: number } | null {
  try {
    const t = JSON.parse(readFileSync(terrainCachePath(caseId), "utf8")) as {
      minElevationM?: unknown;
      maxElevationM?: unknown;
    };
    return typeof t.minElevationM === "number" && typeof t.maxElevationM === "number"
      ? { minElevationM: t.minElevationM, maxElevationM: t.maxElevationM }
      : null;
  } catch {
    return null;
  }
}

/**
 * The rainfall series as the case record holds it: only available yearly precipitation values, with
 * the trend recomputed from them. Vegetation is not measured for live places, so none is passed on.
 */
function extractClimateFromSnapshot(
  measurements: ReadonlyArray<{
    metric: string;
    value: number | null;
    periodId: string;
    status: string;
  }>,
): HistoricalClimateSummary {
  const rain = measurements.filter(
    (m) => m.metric === "precipitation_annual_mm" && m.status === "available" && m.value !== null,
  );
  const years = rain
    .map((m) => ({ year: Number(m.periodId.slice(7, 11)), precipMm: m.value ?? 0, et0Mm: null }))
    .filter((r) => Number.isInteger(r.year))
    .sort((a, b) => a.year - b.year);
  return years.length < MIN_COMPLETE_YEARS
    ? unavailableClimate(`the case record holds ${String(years.length)} rainfall years`)
    : computeStatsFromAnnual(years, OPEN_METEO_SOURCE);
}

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
 * Completes a follow-up question the client sends after its command is accepted: claims the command, reads (with
 * live search, also retrieves) sources, asks the model, keeps only what its checks allow, and commits the outcome
 * under one source research task (lib/live-place/follow-up.ts). It never writes a branch, merge or brief.
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

  // web search is P1 and billed per query: only an explicit true turns it on
  let liveSearch = false;
  try {
    const body = (await request.json()) as { liveSearch?: unknown } | null;
    liveSearch = body?.liveSearch === true;
  } catch {
    // no body, or not JSON: no live search
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
    return await complete(db, { caseId, command, ownerScopeId: session.ownerScopeId, liveSearch });
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
  args: { caseId: string; command: Command; ownerScopeId: string; liveSearch: boolean },
): Promise<Response> {
  const { caseId, command, liveSearch } = args;
  const commandId = command.id;
  const startedAt = new Date().toISOString();
  const snap = await readSnapshot(db, caseId, args.ownerScopeId);
  if (!snap) {
    throw new Error(`Case ${caseId} is not readable`);
  }

  const placeName = snap.case.place?.name ?? snap.case.title;
  const regionName = snap.case.place?.region ?? "";
  const geoId =
    snap.case.activeGeoSelectionId ?? snap.records.geoSelectionRecords[0]?.id ?? `geo_${caseId}`;
  const outlet = (snap.records.contextFeatureRecords ?? []).find((f) => f.role === "outlet");
  const coords = outlet?.geometry.type === "Point" ? outlet.geometry.coordinates : [-6.42, 31.66];
  const lon = coords[0] ?? -6.42;
  const lat = coords[1] ?? 31.66;

  const cmdHash = commandHash(commandId);
  const slug =
    placeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 16) || "place";
  const taskId = followUpTaskId(cmdHash);

  /** Commits the outcome (a task that did not succeed keeps nothing it found), then ends the command. */
  const finish = async (outcome: {
    status: FollowUpStatus;
    failureCode?: string;
    call?: ModelCall;
    sources?: Source[];
    evidence?: Evidence[];
  }): Promise<Response> => {
    const now = new Date().toISOString();
    const kept = outcome.status === "succeeded" ? (outcome.evidence ?? []) : [];
    const keptSources = outcome.status === "succeeded" ? (outcome.sources ?? []) : [];
    // the case's own records the kept Evidence rests on, at the revisions read; the new Sources are written here
    const held = new Map(snap.records.sourceRecords.map((s) => [s.id, s.revision]));
    const inputs = kept
      .flatMap((e) => e.provenance.inputVersions)
      .filter((v) => held.get(v.entityId) === v.revision);
    const record = (
      status: FollowUpStatus,
      failureCode: string | null,
      sources: Source[],
      evidence: Evidence[],
    ) => {
      const task = followUpTask({
        caseId,
        commandId,
        question: command.text,
        taskId,
        hash: cmdHash,
        startedAt,
        now,
        status,
        failureCode,
        evidenceIds: evidence.map((e) => e.id),
        inputVersions: evidence.length > 0 ? inputs : [],
      });
      return followUpCommit({
        id: newId("commit"),
        caseRecord: snap.case,
        commandId,
        taskId,
        now,
        inputVersions: task.inputVersions,
        upserts: [task, ...sources, ...evidence],
        events: followUpEvents({
          commandId,
          taskId,
          placeName,
          liveSearch,
          startedAt,
          now,
          status,
          failureCode,
          call: outcome.call ?? null,
          sourceIds: sources.map((s) => s.id),
          acceptedIds: evidence.filter((e) => e.status === "accepted").map((e) => e.id),
          provisionalIds: evidence.filter((e) => e.status !== "accepted").map((e) => e.id),
        }),
      });
    };

    let status = outcome.status;
    let committed = await applyCommit(
      db,
      record(status, outcome.failureCode ?? null, keptSources, kept),
    );
    if (committed.status === "stale") {
      // a Source the Evidence cites changed after it was read: none of this answer is kept, and the task says why
      status = "failed";
      committed = await applyCommit(db, record(status, "stale_inputs", [], []));
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
    // no live search either: its results could only be read by the model
    return finish({ status: "failed", failureCode: "model_not_configured" });
  }

  const newlyFetchedSources: Source[] = [];
  const newlyCreatedEvidence: Evidence[] = [];
  if (liveSearch) {
    try {
      const existingTitles = snap.records.sourceRecords.map((s) => s.title);
      const queryText = `${placeName} ${command.text.slice(0, 70)}`;
      const [oaSources, regCtx, govPolicy] = await Promise.all([
        fetchOpenAlexSources(caseId, `${slug}_q`, cmdHash, queryText, regionName, startedAt),
        fetchRegionalContextAndGovernance({
          caseId,
          slug: `${slug}_q`,
          hash6: cmdHash,
          lon,
          lat,
          placeName,
          regionName,
          geoId,
          now: startedAt,
          existingSourceTitles: existingTitles,
        }),
        fetchGovernmentPolicyAndOpenAccess({
          caseId,
          slug: `${slug}_q`,
          hash6: cmdHash,
          placeName,
          regionName,
          geoId,
          now: startedAt,
          question: command.text,
          existingSourceTitles: existingTitles,
        }),
      ]);
      // each record once, and none the case already holds: a commit writes an entity at most once
      const seen = new Set([
        ...snap.records.sourceRecords.map((s) => s.id),
        ...snap.records.evidenceRecords.map((e) => e.id),
      ]);
      const fresh = <T extends { id: string }>(records: readonly T[]): T[] => {
        const kept: T[] = [];
        for (const r of records) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          kept.push(r);
        }
        return kept;
      };
      newlyFetchedSources.push(
        ...fresh([
          ...oaSources.filter((s) => s.sourceKind === "peer_reviewed").slice(0, 2),
          ...regCtx.contextSources.slice(0, 2),
          ...govPolicy.sources.slice(0, 3),
        ]),
      );
      // retrieved by this follow-up's task, so credited to it
      newlyCreatedEvidence.push(
        ...fresh([...regCtx.contextEvidence.slice(0, 2), ...govPolicy.evidence.slice(0, 2)]).map(
          (e) => ({ ...e, provenance: { ...e.provenance, generatedByTaskId: taskId } }),
        ),
      );
    } catch {
      // Non-fatal if offline
    }
    if (await isCancelRequested(db, commandId)) {
      return finish({ status: "cancelled" });
    }
  }

  const allSources: Source[] = [...newlyFetchedSources, ...snap.records.sourceRecords];
  const bandLimitMeas = snap.records.measurementRecords.find(
    (m) => m.metric === "elevation_band_limit" && typeof m.value === "number",
  );
  const areaMeas = snap.records.measurementRecords.find(
    (m) => m.metric === "drainage_outlet_upstream_area" && typeof m.value === "number",
  );
  const span = terrainSpan(caseId);

  const transport = observedFetch((input, init) => globalThis.fetch(input, init));
  const callStart = Date.now();
  const llmResult = await reasonOverCaseWithLlm({
    placeName,
    regionName,
    lon,
    lat,
    minElevationM: span?.minElevationM ?? null,
    maxElevationM: span?.maxElevationM ?? null,
    ...(typeof bandLimitMeas?.value === "number" ? { bandLimitM: bandLimitMeas.value } : {}),
    ...(typeof areaMeas?.value === "number" ? { areaKm2: areaMeas.value } : {}),
    climate: extractClimateFromSnapshot(snap.records.measurementRecords),
    sources: allSources,
    question: command.text,
    config,
    fetchImpl: transport.fetch,
  });
  const callEnd = Date.now();
  const call: ModelCall = {
    model: config.model,
    startedAt: new Date(callStart).toISOString(),
    endedAt: new Date(callEnd).toISOString(),
    durationMs: callEnd - callStart,
    answered: llmResult !== null,
    transport: transport.report(),
  };

  if (await isCancelRequested(db, commandId)) {
    return finish({ status: "cancelled", call });
  }
  if (llmResult === null) {
    return finish({ status: "failed", failureCode: noAnswerCode(call.transport), call });
  }
  // the model's causes and summary are written nowhere; its findings only as the checks allow
  const found = verifiedFindingEvidence(llmResult.verifiedFindings, allSources, {
    caseId,
    geoSelectionId: geoId,
    taskId,
    hash: cmdHash,
    now: call.endedAt,
  });
  return finish({
    status: "succeeded",
    call,
    sources: newlyFetchedSources,
    evidence: [...newlyCreatedEvidence, ...found],
  });
}
