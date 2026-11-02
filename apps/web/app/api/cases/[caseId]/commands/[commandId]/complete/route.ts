import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type BranchMerge,
  type Brief,
  type BriefItem,
  type Command,
  type EnvironmentalCase,
  Evidence,
  type ExplanationBranch,
  type Source,
  type Task,
} from "@siterra/contracts";
import {
  inTransaction,
  insertEvents,
  lockCase,
  notifyEvents,
  readSnapshot,
  setCommandStatus,
  setLastSequence,
} from "@siterra/db";
import {
  type HistoricalClimateSummary,
  MIN_COMPLETE_YEARS,
  OPEN_METEO_SOURCE,
  computeStatsFromAnnual,
  unavailableClimate,
} from "../../../../../../../lib/live-place/climate-series.ts";
import { fetchRegionalContextAndGovernance } from "../../../../../../../lib/live-place/context-fetcher.ts";
import { fetchGovernmentPolicyAndOpenAccess } from "../../../../../../../lib/live-place/government-policy-fetcher.ts";
import { fetchOpenAlexSources } from "../../../../../../../lib/live-place/literature.ts";
import { terrainCachePath } from "../../../../../../../lib/live-place/terrain-builder.ts";
import {
  choreographyForExplanation,
  reasonOverCaseWithLlm,
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

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string; commandId: string }> },
): Promise<Response> {
  const { caseId, commandId } = await context.params;
  const session = fromApplicationOrigin(request) ? await requestSession(request) : null;
  if (session === null) {
    return problem(401, "unauthenticated");
  }

  let liveSearch = true;
  try {
    const body = (await request.json()) as { liveSearch?: boolean };
    if (typeof body?.liveSearch === "boolean") {
      liveSearch = body.liveSearch;
    }
  } catch {
    // Default liveSearch = true
  }

  const db = database();
  const cmdRow = await db.query<{ record: Command; status: string }>(
    "SELECT record, status FROM commands WHERE id = $1 AND case_id = $2",
    [commandId, caseId],
  );
  const cmd = cmdRow.rows[0];
  if (!cmd || cmd.status !== "accepted") {
    return json({ status: "skipped" }, 200);
  }

  const snap = await readSnapshot(db, caseId, session.ownerScopeId);
  if (!snap) {
    return json({ status: "skipped" }, 200);
  }

  const now = new Date().toISOString();
  const placeName = snap.case.place?.name ?? snap.case.title;
  const regionName = snap.case.place?.region ?? "";
  const geoId =
    snap.case.activeGeoSelectionId ??
    snap.records.geoSelectionRecords[0]?.id ??
    `geo_${caseId}`;
  const outlet = (snap.records.contextFeatureRecords ?? []).find((f) => f.role === "outlet");
  const coords =
    outlet?.geometry.type === "Point" ? outlet.geometry.coordinates : [-6.42, 31.66];
  const lon = coords[0] ?? -6.42;
  const lat = coords[1] ?? 31.66;

  const cmdHash = createHash("sha256").update(commandId).digest("hex").slice(0, 6);
  const slug =
    placeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 16) || "place";

  const taskId = `task_cmd_${cmdHash}`;
  const briefTaskId = `task_brief_${cmdHash}`;
  const newEntityIds: string[] = [];
  const newlyFetchedSources: Source[] = [];
  const newlyCreatedEvidence: Evidence[] = [];

  if (liveSearch) {
    try {
      const existingTitles = snap.records.sourceRecords.map((s) => s.title);
      const queryText = `${placeName} ${cmd.record.text.slice(0, 70)}`;
      const [oaSources, regCtx, govPolicy] = await Promise.all([
        fetchOpenAlexSources(caseId, `${slug}_q`, cmdHash, queryText, regionName, now),
        fetchRegionalContextAndGovernance({
          caseId,
          slug: `${slug}_q`,
          hash6: cmdHash,
          lon,
          lat,
          placeName,
          regionName,
          geoId,
          now,
          existingSourceTitles: existingTitles,
        }),
        fetchGovernmentPolicyAndOpenAccess({
          caseId,
          slug: `${slug}_q`,
          hash6: cmdHash,
          placeName,
          regionName,
          geoId,
          now,
          question: cmd.record.text,
          existingSourceTitles: existingTitles,
        }),
      ]);

      const peerStudies = oaSources.filter((s) => s.sourceKind === "peer_reviewed").slice(0, 2);
      const candidateSources = [
        ...peerStudies,
        ...regCtx.contextSources.slice(0, 2),
        ...govPolicy.sources.slice(0, 3),
      ];
      for (const src of candidateSources) {
        await db.query(
          `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
           VALUES ($1, $2, $3, 'Source', $4, $5)
           ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
          [caseId, src.id, src.revision, JSON.stringify(src), snap.case.revision],
        );
        newlyFetchedSources.push(src);
        newEntityIds.push(src.id);
      }

      const candidateEvidence = [
        ...regCtx.contextEvidence.slice(0, 2),
        ...govPolicy.evidence.slice(0, 2),
      ];
      for (const rawEv of candidateEvidence) {
        const evWithTask: Evidence = {
          ...rawEv,
          provenance: {
            ...rawEv.provenance,
            generatedByTaskId: briefTaskId,
          },
        };
        await db.query(
          `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
           VALUES ($1, $2, $3, 'Evidence', $4, $5)
           ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
          [caseId, evWithTask.id, evWithTask.revision, JSON.stringify(evWithTask), snap.case.revision],
        );
        newlyCreatedEvidence.push(evWithTask);
        newEntityIds.push(evWithTask.id);
      }
    } catch {
      // Non-fatal if offline
    }
  }

  const allSources: Source[] = [...newlyFetchedSources, ...snap.records.sourceRecords];
  const climate = extractClimateFromSnapshot(snap.records.measurementRecords ?? []);
  const bandLimitMeas = (snap.records.measurementRecords ?? []).find(
    (m) => m.metric === "elevation_band_limit" && typeof m.value === "number",
  );
  const areaMeas = snap.records.measurementRecords.find(
    (m) => m.metric === "drainage_outlet_upstream_area" && typeof m.value === "number",
  );
  const span = terrainSpan(caseId);

  const llmResult = await reasonOverCaseWithLlm({
    placeName,
    regionName,
    lon,
    lat,
    minElevationM: span?.minElevationM ?? null,
    maxElevationM: span?.maxElevationM ?? null,
    ...(typeof bandLimitMeas?.value === "number" ? { bandLimitM: bandLimitMeas.value } : {}),
    ...(typeof areaMeas?.value === "number" ? { areaKm2: areaMeas.value } : {}),
    climate,
    sources: allSources,
    question: cmd.record.text,
  });

  if (llmResult?.verifiedFindings) {
    for (let i = 0; i < llmResult.verifiedFindings.length; i++) {
      const vf = llmResult.verifiedFindings[i]!;
      const parsedEv = Evidence.safeParse({
        recordType: "Evidence",
        id: `ev_llm_${cmdHash}_${String(i + 1)}`,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        caseId,
        statement: vf.statement,
        claimKind: "scientific_context",
        status: "accepted",
        geoSelectionId: geoId,
        periodIds: [],
        measurementIds: [],
        provenance: {
          sourceLocators: [
            {
              sourceId: vf.sourceId,
              locator: "verified excerpt",
              excerpt: vf.exactQuote.slice(0, 260),
            },
          ],
          dataBundleIds: [],
          methodId: null,
          methodVersion: null,
          inputVersions: [{ entityId: vf.sourceId, revision: 1 }],
          generatedByTaskId: briefTaskId,
          generatedAt: now,
          verificationStatus: "source_checked",
          limitations: [
            "Independently verified verbatim quote from retrieved source corpus.",
          ],
        },
        interpretation: vf.interpretation || null,
        uncertainty: "Published literature or regulatory excerpt; field verification required for site-level decisions.",
        reviewDecisionIds: [],
      });
      if (parsedEv.success) {
        await db.query(
          `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
           VALUES ($1, $2, $3, 'Evidence', $4, $5)
           ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
          [
            caseId,
            parsedEv.data.id,
            parsedEv.data.revision,
            JSON.stringify(parsedEv.data),
            snap.case.revision + 1,
          ],
        );
        newlyCreatedEvidence.push(parsedEv.data);
        newEntityIds.push(parsedEv.data.id);
      }
    }
  }

  const llmCauseByExp = new Map(
    (llmResult?.causes ?? []).map((c) => [c.explanationId, c] as const),
  );

  // Bind the case's latest BranchMerge, ExplanationBranches, and Brief Task to this commandId
  const latestMerge = (snap.records.branchMergeRecords ?? []).at(-1);
  const latestBrief = snap.records.briefRecords.at(-1);

  if (latestMerge) {
    const sourceBranches = (snap.records.explanationBranchRecords ?? []).filter(
      (b) => b.commandId === latestMerge.commandId,
    );
    const clonedBranches: ExplanationBranch[] = sourceBranches.map((b) => {
      const llmCause = llmCauseByExp.get(
        b.explanationId as
          | "rainfall"
          | "grazing"
          | "land_use"
          | "snow_terrain"
          | "data_artefact",
      );
      return {
        ...b,
        id: `branch_${b.explanationId}_${cmdHash}`,
        revision: 2,
        commandId,
        taskId,
        statement: llmCause?.statement || b.statement,
        statusReason: llmCause?.statusReason || b.statusReason,
        predictions:
          llmCause && b.predictions.length > 0
            ? [
                {
                  ...b.predictions[0]!,
                  wording: llmCause.prediction || b.predictions[0]!.wording,
                },
                ...b.predictions.slice(1),
              ]
            : b.predictions,
        model: llmResult
          ? {
              ...b.model,
              model: llmResult.model,
              promptVersion: "llm-reasoner@1",
            }
          : b.model,
        createdAt: now,
        updatedAt: now,
      };
    });
    for (const cb of clonedBranches) {
      await db.query(
        `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
         VALUES ($1, $2, $3, 'ExplanationBranch', $4, $5)
         ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
        [caseId, cb.id, cb.revision, JSON.stringify(cb), snap.case.revision + 1],
      );
      newEntityIds.push(cb.id);
    }

    const branchIdMap = new Map<string, string>();
    for (const b of sourceBranches) {
      branchIdMap.set(b.id, `branch_${b.explanationId}_${cmdHash}`);
    }

    const clonedMerge: BranchMerge = {
      ...latestMerge,
      id: `merge_${cmdHash}`,
      revision: 1,
      commandId,
      taskId,
      createdAt: now,
      updatedAt: now,
      branches: latestMerge.branches.map((mb) => {
        const llmCause = llmCauseByExp.get(
          mb.explanationId as
            | "rainfall"
            | "grazing"
            | "land_use"
            | "snow_terrain"
            | "data_artefact",
        );
        return {
          ...mb,
          branchId: branchIdMap.get(mb.branchId) ?? mb.branchId,
          reason: llmCause?.statusReason || mb.reason,
        };
      }),
      conflicts: latestMerge.conflicts.map((c) => ({
        ...c,
        predictions: c.predictions.map((p) => ({
          ...p,
          branchId: branchIdMap.get(p.branchId) ?? p.branchId,
        })),
      })),
    };
    await db.query(
      `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
       VALUES ($1, $2, $3, 'BranchMerge', $4, $5)
       ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
      [
        caseId,
        clonedMerge.id,
        clonedMerge.revision,
        JSON.stringify(clonedMerge),
        snap.case.revision + 1,
      ],
    );
    newEntityIds.push(clonedMerge.id);
  }

  let updatedBriefId: string | null = null;
  if (latestBrief) {
    const clonedBriefId = `brief_${cmdHash}`;
    updatedBriefId = clonedBriefId;

    const newKnownItems: BriefItem[] = [];
    if (llmResult?.briefSummary) {
      const citeIds =
        newlyCreatedEvidence.length > 0
          ? newlyCreatedEvidence.map((e) => e.id)
          : latestBrief.evidenceIds.slice(0, 2);
      newKnownItems.push({
        text: llmResult.briefSummary.slice(0, 395),
        claimKind: "scientific_context",
        evidenceIds: citeIds,
        measurementIds: [],
      });
    }
    for (const ev of newlyCreatedEvidence) {
      newKnownItems.push({
        text: ev.statement.slice(0, 395),
        claimKind: ev.claimKind,
        evidenceIds: [ev.id],
        measurementIds: ev.measurementIds,
      });
    }

    const clonedBrief: Brief = {
      ...latestBrief,
      id: clonedBriefId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      evidenceIds: [
        ...new Set([
          ...newlyCreatedEvidence.map((e) => e.id),
          ...latestBrief.evidenceIds,
        ]),
      ],
      known: [...newKnownItems, ...latestBrief.known].slice(0, 8),
      mode: llmResult ? "live" : latestBrief.mode,
      provenance: {
        ...latestBrief.provenance,
        generatedByTaskId: briefTaskId,
        generatedAt: now,
      },
    };
    const clonedBriefTask: Task = {
      recordType: "Task",
      id: briefTaskId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      caseId,
      commandId,
      kind: "brief_package",
      question: cmd.record.text,
      status: "awaiting_review",
      dependsOnTaskIds: [],
      inputVersions: [],
      allowedTools: ["read_case", "read_evidence", "propose_package", "request_review"],
      outputEntityIds: [
        ...newlyCreatedEvidence.map((e) => e.id),
        ...latestBrief.actionIds,
        clonedBriefId,
      ],
      idempotencyKey: `brief-task-${cmdHash}`,
      attempt: 0,
      maxModelRounds: 3,
      deadlineAt: now,
      budgetMicroUsd: 0,
      spentMicroUsd: 0,
      checkpointId: null,
      failureCode: null,
      missingInputs: [],
      startedAt: now,
      finishedAt: now,
    };
    await db.query(
      `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
       VALUES ($1, $2, $3, 'Task', $4, $5)
       ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
      [caseId, clonedBriefTask.id, 1, JSON.stringify(clonedBriefTask), snap.case.revision + 1],
    );
    await db.query(
      `INSERT INTO records (case_id, entity_id, revision, record_type, record, case_revision)
       VALUES ($1, $2, $3, 'Brief', $4, $5)
       ON CONFLICT (case_id, entity_id, revision) DO NOTHING`,
      [caseId, clonedBrief.id, 1, JSON.stringify(clonedBrief), snap.case.revision + 1],
    );
    newEntityIds.push(clonedBriefTask.id, clonedBrief.id);
  }

  const nextRev = snap.case.revision + 1;
  await inTransaction(db, async (tx) => {
    const locked = await lockCase(tx, caseId);
    if (!locked) return;
    const baseRecord = locked.record as EnvironmentalCase;
    const updatedCase: EnvironmentalCase = {
      ...baseRecord,
      revision: nextRev,
      updatedAt: now,
      ...(updatedBriefId ? { currentBriefId: updatedBriefId } : {}),
    };
    await tx.query("UPDATE cases SET revision = $2, record = $3 WHERE id = $1", [
      caseId,
      nextRev,
      JSON.stringify(updatedCase),
    ]);
    await tx.query(
      "INSERT INTO case_revisions (case_id, revision, record) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [caseId, nextRev, JSON.stringify(updatedCase)],
    );

    const { lastSequence } = await insertEvents(
      tx,
      { ...locked, revision: nextRev, record: updatedCase },
      [
        {
          occurredAt: now,
          kind: "task.started",
          commandId,
          taskId,
          entityIds: [taskId],
          message: `Testing competing explanations and retrieving ${liveSearch ? "live literature, regulatory notices & governance context" : "verified corpus"} for ${placeName}.`,
          dedupeKey: `task.started:${taskId}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
        {
          occurredAt: now,
          kind: "case.committed",
          commandId,
          taskId,
          entityIds: newEntityIds.length > 0 ? newEntityIds : [caseId],
          message: `Committed competing explanation synthesis and local context for ${placeName}.`,
          dedupeKey: `case.committed:${commandId}`,
          resultStatus: null,
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
        {
          occurredAt: now,
          kind: "task.succeeded",
          commandId,
          taskId,
          entityIds: [taskId],
          message: "Completed explanation branch scoring and field check plan.",
          dedupeKey: `task.succeeded:${taskId}`,
          resultStatus: "succeeded",
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
        {
          occurredAt: now,
          kind: "command.completed",
          commandId,
          taskId: null,
          entityIds: [commandId],
          message: "Completed.",
          dedupeKey: `command.completed:${commandId}`,
          resultStatus: "succeeded",
          tool: null,
          usage: null,
          validation: null,
          spanId: null,
          parentSpanId: null,
        },
      ],
      nextRev,
    );
    await setLastSequence(tx, caseId, lastSequence);
    await notifyEvents(tx, caseId);
  });

  const visualChoreography =
    llmResult?.visualChoreography ??
    (["rainfall", "grazing", "land_use", "snow_terrain", "data_artefact"] as const).map((expId) =>
      choreographyForExplanation(
        expId,
        typeof bandLimitMeas?.value === "number" ? bandLimitMeas.value : undefined,
        span ?? {},
      ),
    );

  await setCommandStatus(db, commandId, "succeeded", [taskId, briefTaskId]);
  return json(
    {
      status: "completed",
      commandId,
      revision: nextRev,
      visualChoreography,
    },
    200,
  );
}
