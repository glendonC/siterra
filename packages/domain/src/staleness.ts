// Staleness propagation (data-contracts.md, principles 2; agent-orchestration.md, staleness; DF-03):
// when a commit gives an entity a newer revision, every current record that cites an older revision
// of it becomes stale through a new revision of its own, and so does every record that cites one
// of those. History stays readable: nothing is rewritten. A record changes only where its state
// machine has a stale state and allows the move to it.

import { canonicalJson } from "./canonical-json.ts";

export type VersionRef = { entityId: string; revision: number };
export type CaseRecord = { recordType: string; id: string; revision: number; updatedAt: string };

type Json = { [key: string]: unknown };

function isRef(value: unknown): value is VersionRef {
  const v = value as Json | null;
  return typeof v?.["entityId"] === "string" && typeof v["revision"] === "number";
}

/** The exact entity versions a record says it rests on. */
export function citedVersions(record: CaseRecord): VersionRef[] {
  const r = record as unknown as Json;
  const refs: VersionRef[] = [];
  const provenance = r["provenance"] as Json | undefined;
  for (const list of [
    provenance?.["inputVersions"],
    r["reviewedEntityVersions"],
    r["entityVersions"],
  ]) {
    if (Array.isArray(list)) refs.push(...list.filter(isRef));
  }
  if (record.recordType === "Relationship") {
    refs.push(
      { entityId: String(r["fromEntityId"]), revision: Number(r["fromEntityRevision"]) },
      { entityId: String(r["toEntityId"]), revision: Number(r["toEntityRevision"]) },
    );
  }
  return refs;
}

/**
 * The next revision of a record marked stale, or null when it is stale already or has no stale state
 * its state machine allows from where it is (data-contracts.md, state machines).
 */
export function markedStale<T extends CaseRecord>(record: T, now: string): T | null {
  const r = record as unknown as Json;
  const next = (fields: Json) =>
    ({ ...record, ...fields, revision: record.revision + 1, updatedAt: now }) as T;
  switch (record.recordType) {
    case "Evidence":
      return r["status"] === "accepted" ? next({ status: "stale" }) : null;
    case "Hypothesis":
    case "Intervention":
    case "Relationship":
      return r["status"] === "stale" ? null : next({ status: "stale" });
    case "Brief":
      return ["draft", "ready_for_review", "prepared"].includes(String(r["status"]))
        ? next({ status: "stale" })
        : null;
    case "CanvasComponent":
      return r["presentationStatus"] === "stale" ? null : next({ presentationStatus: "stale" });
    case "ReviewDecision":
      return r["stale"] === true ? null : next({ stale: true });
    default:
      return null;
  }
}

/**
 * New stale revisions for the current records (latest revision of each entity, none of them written
 * by the commit itself) that cite an older revision of a changed entity, directly or through a
 * record this marks stale. `changed` maps each entity the commit wrote to its new revision.
 */
export function propagateStaleness<T extends CaseRecord>(
  current: readonly T[],
  changed: ReadonlyMap<string, number>,
  now: string,
): T[] {
  const latest = new Map(changed);
  const staled = new Map<string, T>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const record of current) {
      if (staled.has(record.id) || changed.has(record.id)) continue;
      const outdated = citedVersions(record).some((ref) => {
        const newest = latest.get(ref.entityId);
        return newest !== undefined && ref.revision < newest;
      });
      if (!outdated) continue;
      const stale = markedStale(record, now);
      if (stale !== null) {
        staled.set(record.id, stale);
        latest.set(record.id, stale.revision);
        grew = true;
      }
    }
  }
  return [...staled.values()];
}

/** Bookkeeping fields: a change in these alone is never material. */
export const bookkeepingFields: readonly string[] = [
  "revision",
  "updatedAt",
  "reviewDecisionIds",
  "remainingConditions",
];

/** State fields, judged by record type below. */
export const stateFields: readonly string[] = [
  "status",
  "presentationStatus",
  "stale",
  "mapStatus",
];

/** Workflow records: a change of state alone (an action moving to prepared) is not material. */
export const workflowRecordTypes: readonly string[] = [
  "OperationalAction",
  "CanvasComponent",
  "Brief",
  "ReviewDecision",
];

/**
 * Data records: a move to one of these states withdraws what rests on the record, so it is material;
 * other moves of state (provisional to accepted) are not.
 */
export const dataRecordTypes: readonly string[] = [
  "Measurement",
  "TemporalObservation",
  "DataBundle",
  "Evidence",
];
export const withdrawingStates: readonly string[] = [
  "invalid",
  "excluded",
  "missing",
  "failed",
  "superseded",
  "rejected",
];

/**
 * True when the new revision is a material change (review-and-authority.md, state and invalidation:
 * a change to data, method, area, scope or wording), or there is no previous revision. Bookkeeping
 * never counts. A change of state counts for every record type except workflow records; for data
 * records only a move to a withdrawing state counts.
 */
export function isMaterialChange(previous: CaseRecord | undefined, next: CaseRecord): boolean {
  if (previous === undefined) {
    return true;
  }
  // Canonical JSON: the stored record comes back from jsonb with its keys in another order.
  const content = (record: CaseRecord) =>
    canonicalJson(
      Object.fromEntries(
        Object.entries(record as unknown as Json).filter(
          ([key]) => !bookkeepingFields.includes(key) && !stateFields.includes(key),
        ),
      ),
    );
  if (content(previous) !== content(next)) {
    return true;
  }
  const before = previous as unknown as Json;
  const after = next as unknown as Json;
  return stateFields.some((field) => {
    if (before[field] === after[field]) return false;
    if (workflowRecordTypes.includes(next.recordType)) return false;
    if (dataRecordTypes.includes(next.recordType))
      return withdrawingStates.includes(String(after[field]));
    return true;
  });
}
