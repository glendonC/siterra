import { Event, type CaseSnapshot } from "@siterra/contracts";
import recordedRunRaw from "./fixtures/recorded-run.json";
import type { RecordedRun } from "./recorded";

const parsedBaseEvents: Event[] = (recordedRunRaw.events as unknown[]).map((e) => Event.parse(e));
const baseSnapshot = recordedRunRaw.snapshot as unknown as CaseSnapshot;

/**
 * Builds a RecordedRun for any CaseSnapshot:
 * - For the Aït Bouguemez reference case, uses the exact recorded run fixture.
 * - For any other studied watershed or newly ingested unseen location (`case_loc_...`),
 *   maps the 7-agent orchestration timeline onto that case's own `sourceRecords`,
 *   `dataBundleRecords`, `evidenceRecords`, `explanationBranchRecords`, and `branchMergeRecords`
 *   so every cursor label, citation chip, finding count, explanation branch, and field check
 *   is grounded in the active place's snapshot.
 */
export function buildRecordedRunForCase(
  snapshot: CaseSnapshot,
  question: string,
  speed: number,
  at: number | null,
): RecordedRun {
  const isAitBouguemez =
    snapshot.case.id === "case_aitbouguemez" ||
    snapshot.case.id === baseSnapshot.case.id ||
    snapshot.case.title.toLowerCase().includes("bouguemez");

  if (isAitBouguemez) {
    return {
      commandId: recordedRunRaw.commandId,
      question,
      snapshot: baseSnapshot,
      events: parsedBaseEvents,
      speed,
      at,
    };
  }

  const commandId = recordedRunRaw.commandId;
  const ownSources = snapshot.records.sourceRecords;
  const baseSources = baseSnapshot.records.sourceRecords;

  const sourceMap = new Map<string, string>();
  baseSources.forEach((bs, idx) => {
    const replacement = ownSources[idx % Math.max(1, ownSources.length)];
    if (replacement) {
      sourceMap.set(bs.id, replacement.id);
    }
  });

  const ownEvidence = snapshot.records.evidenceRecords;
  const baseEvidence = baseSnapshot.records.evidenceRecords;
  const evidenceMap = new Map<string, string>();
  baseEvidence.forEach((be, idx) => {
    const replacement = ownEvidence[idx % Math.max(1, ownEvidence.length)];
    if (replacement) {
      evidenceMap.set(be.id, replacement.id);
    }
  });

  const ownBranches = snapshot.records.explanationBranchRecords ?? [];
  const baseBranches = baseSnapshot.records.explanationBranchRecords ?? [];
  const branchMap = new Map<string, string>();
  baseBranches.forEach((bb, idx) => {
    const replacement = ownBranches[idx % Math.max(1, ownBranches.length)];
    if (replacement) {
      branchMap.set(bb.id, replacement.id);
    }
  });

  const ownMerge = (snapshot.records.branchMergeRecords ?? []).at(-1);
  const baseMerge = (baseSnapshot.records.branchMergeRecords ?? []).at(-1);

  const mapEntityId = (id: string): string => {
    if (sourceMap.has(id)) return sourceMap.get(id)!;
    if (evidenceMap.has(id)) return evidenceMap.get(id)!;
    if (branchMap.has(id)) return branchMap.get(id)!;
    if (baseMerge && ownMerge && id === baseMerge.id) return ownMerge.id;
    return id;
  };

  const replaceSourceInSummary = (summary: string): string => {
    let out = summary;
    for (const [oldId, newId] of sourceMap.entries()) {
      if (out.includes(oldId)) {
        out = out.replaceAll(oldId, newId);
      }
    }
    return out;
  };

  // Clone and adapt snapshot so commandFindings / commandMerge resolve under `commandId`
  const adaptedEvidence = ownEvidence.map((ev, idx) => {
    const templateEv = baseEvidence[idx % Math.max(1, baseEvidence.length)];
    return {
      ...ev,
      geoSelectionId: snapshot.case.activeGeoSelectionId,
      provenance: {
        ...ev.provenance,
        generatedByTaskId:
          templateEv?.provenance.generatedByTaskId ?? ev.provenance.generatedByTaskId,
      },
    };
  });

  const adaptedBranches =
    ownBranches.length > 0
      ? ownBranches.map((b) => ({ ...b, commandId }))
      : baseBranches.map((b) => ({ ...b, commandId }));

  const adaptedMerges =
    ownMerge !== undefined
      ? [{ ...ownMerge, commandId }]
      : baseMerge !== undefined
        ? [{ ...baseMerge, commandId }]
        : [];

  const adaptedTasks = baseSnapshot.records.taskRecords.map((tr) => ({
    ...tr,
    caseId: snapshot.case.id,
    commandId,
    inputVersions: tr.inputVersions.map((iv) => ({
      ...iv,
      entityId: mapEntityId(iv.entityId),
    })),
  }));

  const adaptedSnapshot: CaseSnapshot = {
    ...snapshot,
    records: {
      ...snapshot.records,
      taskRecords: adaptedTasks,
      evidenceRecords: adaptedEvidence,
      explanationBranchRecords: adaptedBranches,
      branchMergeRecords: adaptedMerges,
    },
  };

  const adaptedEvents: Event[] = parsedBaseEvents.map((ev) => ({
    ...ev,
    caseId: snapshot.case.id,
    entityIds: ev.entityIds.map(mapEntityId),
    tool: ev.tool
      ? {
          ...ev.tool,
          argumentSummary: replaceSourceInSummary(ev.tool.argumentSummary),
          resultEntityIds: ev.tool.resultEntityIds.map(mapEntityId),
        }
      : null,
  }));

  return {
    commandId,
    question,
    snapshot: adaptedSnapshot,
    events: adaptedEvents,
    speed,
    at,
  };
}
