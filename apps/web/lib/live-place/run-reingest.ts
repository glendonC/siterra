// Re-ingests live places whose records were written before vegetation was recorded as not measured
// (place cache version 1): they state NDVI values, trends, fits and FDR shares made from rainfall or
// seeded noise, and explanations judged against them. From the repository root:
//   node apps/web/lib/live-place/run-reingest.ts                 dry run: lists each live case and why
//   node apps/web/lib/live-place/run-reingest.ts --apply         rebuilds each listed case from the live
//                                                                 sources and appends new revisions
//   ... [--case <caseId>]                                         one case only
// DATABASE_URL names the database. --apply writes through applyCommit: new revisions only, never a
// rewritten row. A case whose rebuild finds Open-Meteo silent is skipped, so its record is not traded
// for a blocked one by a passing outage; run it again later.
import { createHash } from "node:crypto";
import {
  type CaseSnapshot,
  EnvironmentalCase,
  type EntityVersion,
  caseSchemaVersion,
} from "@siterra/contracts";
import {
  type CommitProposal,
  CommitRejected,
  type Pool,
  applyCommit,
  createPool,
  readSnapshot,
} from "@siterra/db";
import { LIVE_PIPELINE, type LiveCaseBuild, buildLiveCase } from "./ingest.ts";

/** Times a rebuild stamps afresh; they do not make a record's content differ. */
const TIME_FIELDS = new Set([
  "generatedAt",
  "accessedAt",
  "predictedAt",
  "scoredAt",
  "startedAt",
  "finishedAt",
  "deadlineAt",
]);

const VEGETATION_METRIC = /^ndvi_|^rainfall_fit_r_squared$|^area_share_(?:upward|downward)_fdr$/;

/** Default questions earlier versions wrote; a question the visitor chose matches none of them. */
const EARLIER_DEFAULT_QUESTIONS: readonly RegExp[] = [
  /sustain the baseline stability of /,
  /driving the 25-year vegetation (?:greening|decline|browning) across /,
  /^Has vegetation across .+ changed since 2000, and (?:if so, how much does rainfall explain|what role do .+ and rainfall play)\?$/,
];

/** Why a live case's record needs rebuilding; empty when it is current. */
export function staleReasons(snapshot: CaseSnapshot): string[] {
  const reasons: string[] = [];
  const stated = snapshot.records.measurementRecords.filter(
    (m) => VEGETATION_METRIC.test(m.metric) && m.status === "available",
  );
  if (stated.length > 0)
    reasons.push(`${String(stated.length)} vegetation values recorded as measured`);
  const judged = (snapshot.records.explanationBranchRecords ?? []).filter(
    (b) => b.status === "consistent" || b.status === "contradicted",
  );
  if (stated.length > 0 && judged.length > 0)
    reasons.push(`${String(judged.length)} explanations judged against them`);
  const earlier = snapshot.records.dataBundleRecords.find(
    (b) => b.methodId === LIVE_PIPELINE.methodId && b.methodVersion !== LIVE_PIPELINE.version,
  );
  if (earlier)
    reasons.push(
      `built by live pipeline ${earlier.methodVersion}, current ${LIVE_PIPELINE.version}`,
    );
  return reasons;
}

/** The case's question to keep: the visitor's own, or undefined for an earlier default (rebuilt fresh). */
export function questionToKeep(objective: string): string | undefined {
  return EARLIER_DEFAULT_QUESTIONS.some((re) => re.test(objective)) ? undefined : objective;
}

type AnyRecord = { id: string; revision: number; recordType: string; createdAt: string } & Record<
  string,
  unknown
>;

function isEntityVersion(value: unknown): value is EntityVersion {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 2 &&
    typeof (value as EntityVersion).entityId === "string" &&
    typeof (value as EntityVersion).revision === "number"
  );
}

/** A deep copy with every {entityId, revision} reference passed through `revisionOf`. */
function mapEntityVersions(
  value: unknown,
  revisionOf: (id: string) => number | undefined,
): unknown {
  if (Array.isArray(value)) return value.map((v) => mapEntityVersions(v, revisionOf));
  if (isEntityVersion(value))
    return { entityId: value.entityId, revision: revisionOf(value.entityId) ?? value.revision };
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapEntityVersions(v, revisionOf)]),
    );
  return value;
}

/** The content a revision carries: without its own revision and times, and with references unversioned. */
function content(record: AnyRecord): string {
  const {
    revision: _revision,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = mapEntityVersions(record, () => 0) as AnyRecord;
  const stripTimes = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stripTimes)
      : typeof v === "object" && v !== null
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([k]) => !TIME_FIELDS.has(k))
              .map(([k, x]) => [k, stripTimes(x)]),
          )
        : v;
  return JSON.stringify(stripTimes(rest));
}

function referencesAny(record: AnyRecord, ids: ReadonlySet<string>): boolean {
  let found = false;
  mapEntityVersions(record, (id) => {
    if (ids.has(id)) found = true;
    return undefined;
  });
  return found;
}

/** Every record the rebuild holds, in the order the seed and the package list them. */
function builtRecords(built: LiveCaseBuild): AnyRecord[] {
  const { seed, synth } = built;
  const list: unknown[] = [
    ...seed.sources,
    ...seed.geoSelections,
    ...seed.bundles.flatMap((b) => [b.dataBundle, ...b.temporalObservations, ...b.measurements]),
    ...seed.contextFeatures,
    ...seed.evidence,
    ...seed.instruments,
    synth.task,
    ...synth.fieldRequirementEvidence,
    ...synth.hypotheses,
    ...synth.explanationBranches,
    synth.branchMerge,
    ...synth.interventions,
    ...synth.resourceRequirements,
    synth.operationalAction,
    synth.brief,
  ];
  return list as AnyRecord[];
}

/**
 * The commit that appends the rebuilt record to the stored case: each changed record as the next
 * revision of its id (a new id starts at 1), references moved to the revisions written beside them,
 * unchanged records left alone. Review decisions are never written here: only the review endpoint
 * records them (commit.ts), so the stored ones stay as they are.
 */
export function planReingestCommit(
  snapshot: CaseSnapshot,
  built: LiveCaseBuild,
  now: string,
): CommitProposal {
  const stored = new Map<string, AnyRecord>();
  for (const list of Object.values(snapshot.records) as AnyRecord[][])
    for (const r of list) stored.set(r.id, r);

  const candidates = builtRecords(built).filter((r) => r.recordType !== "ReviewDecision");
  const changed = new Set(
    candidates
      .filter((r) => {
        const old = stored.get(r.id);
        return old === undefined || content(old) !== content(r);
      })
      .map((r) => r.id),
  );
  // An unchanged record that cites a changed one is written too, so it cites the new revision
  for (let grew = true; grew;) {
    grew = false;
    for (const r of candidates)
      if (!changed.has(r.id) && referencesAny(r, changed)) {
        changed.add(r.id);
        grew = true;
      }
  }

  const revisionOf = (id: string): number | undefined => {
    const old = stored.get(id);
    if (changed.has(id)) return (old?.revision ?? 0) + 1;
    return old?.revision;
  };
  const upserts = candidates
    .filter((r) => changed.has(r.id))
    .map((r) => {
      const old = stored.get(r.id);
      return {
        ...(mapEntityVersions(r, revisionOf) as AnyRecord),
        revision: revisionOf(r.id) ?? 1,
        createdAt: old?.createdAt ?? r.createdAt,
        updatedAt: now,
      };
    });

  const expected = snapshot.case.revision;
  const caseAfter = EnvironmentalCase.parse({
    ...built.seed.caseRecord,
    createdAt: snapshot.case.createdAt,
    updatedAt: now,
    revision: expected,
    status: snapshot.case.status,
    mode: snapshot.case.mode,
    ownerScopeId: snapshot.case.ownerScopeId,
  });
  const hash = createHash("sha256")
    .update(`${snapshot.case.id}:${String(expected)}:reingest-v2`)
    .digest("hex")
    .slice(0, 12);
  const placeName = snapshot.case.place?.name ?? snapshot.case.title;

  return {
    recordType: "Commit",
    schemaVersion: caseSchemaVersion,
    id: `commit_reingest_${hash}`,
    caseId: snapshot.case.id,
    commandId: built.synth.commandId,
    taskId: built.synth.task.id,
    expectedCaseRevision: expected,
    newCaseRevision: expected + 1,
    idempotencyKey: `reingest-v2-${hash}`,
    resultKey: null,
    inputVersions: [],
    caseAfter,
    upserts: upserts as CommitProposal["upserts"],
    events: [
      {
        occurredAt: now,
        kind: "case.committed",
        commandId: built.synth.commandId,
        taskId: built.synth.task.id,
        entityIds: upserts.map((r) => r.id),
        message: `Rebuilt the live record for ${placeName}: ${String(upserts.length)} records revised; vegetation is recorded as not measured.`,
        dedupeKey: `case.committed:reingest:${hash}`,
        resultStatus: null,
        tool: null,
        usage: null,
        validation: null,
        spanId: null,
        parentSpanId: null,
      },
    ],
    layoutActions: [],
  };
}

type Log = (line: string) => void;
type CaseRow = { id: string; owner_scope_id: string };

/** One case: list it, and with apply rebuild and commit it. False when it was skipped or refused. */
async function reingestCase(pool: Pool, row: CaseRow, apply: boolean, log: Log): Promise<boolean> {
  const snapshot = await readSnapshot(pool, row.id, row.owner_scope_id);
  if (snapshot === null) return true;
  const reasons = staleReasons(snapshot);
  const place = snapshot.case.place?.name ?? snapshot.case.title;
  if (reasons.length === 0) {
    log(`  ${row.id} (${place}): current, nothing to do`);
    return true;
  }
  const kept = questionToKeep(snapshot.case.objective);
  log(
    `  ${row.id} (${place}), revision ${String(snapshot.case.revision)}: ${reasons.join("; ")}; question ${kept === undefined ? "rebuilt (earlier default)" : "kept (the visitor's)"}`,
  );
  if (!apply) return true;

  const outlet = (snapshot.records.contextFeatureRecords ?? []).find((f) => f.role === "outlet");
  if (outlet?.geometry.type !== "Point") {
    log("    skipped: no outlet point in the record");
    return false;
  }
  const [lon, lat] = outlet.geometry.coordinates;
  const built = await buildLiveCase({
    lon,
    lat,
    placeName: place,
    regionName: snapshot.case.place?.region ?? "",
    question: kept,
    ownerScopeId: row.owner_scope_id,
    allowModel: false,
  });
  if (built.outcome.caseId !== row.id) {
    log(`    skipped: the rebuild names ${built.outcome.caseId}, not ${row.id}`);
    return false;
  }
  if (built.noLand) {
    log("    skipped: no land in the 20 km box");
    return false;
  }
  if (built.rainUnavailable) {
    log("    skipped: Open-Meteo did not answer; run it again later");
    return false;
  }
  const proposal = planReingestCommit(snapshot, built, new Date().toISOString());
  try {
    const outcome = await applyCommit(pool, proposal);
    log(
      outcome.status === "committed"
        ? `    committed revision ${String(outcome.commit.newCaseRevision)}: ${String(proposal.upserts.length)} records revised`
        : `    ${outcome.status}`,
    );
    return outcome.status === "committed" || outcome.status === "duplicate";
  } catch (err) {
    log(
      `    refused: ${err instanceof CommitRejected ? `${err.code}: ` : ""}${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Lists the live cases (and with --apply rebuilds the stale ones). A case that throws is reported and the run
 * carries on with the next one; the exit code is 1 when any case was skipped, refused or failed.
 */
export async function runReingest(
  argv: readonly string[],
  log: Log = console.log,
): Promise<number> {
  const apply = argv.includes("--apply");
  const caseFlag = argv.indexOf("--case");
  const onlyCase = caseFlag === -1 ? undefined : argv[caseFlag + 1];
  if (caseFlag !== -1 && (onlyCase === undefined || onlyCase === "")) {
    log("--case needs a case id");
    return 2;
  }
  const pool = createPool();
  let failures = 0;
  try {
    const rows = await pool.query<CaseRow>(
      "select id, owner_scope_id from cases where id like 'case\\_loc\\_%' order by id",
    );
    const cases = rows.rows.filter((r) => onlyCase === undefined || r.id === onlyCase);
    log(`${apply ? "Apply" : "Dry run"}: ${String(cases.length)} live cases`);
    for (const row of cases) {
      try {
        if (!(await reingestCase(pool, row, apply, log))) failures += 1;
      } catch (err) {
        log(`  ${row.id}: failed: ${err instanceof Error ? err.message : String(err)}`);
        failures += 1;
      }
    }
  } finally {
    await pool.end();
  }
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = await runReingest(process.argv.slice(2));
