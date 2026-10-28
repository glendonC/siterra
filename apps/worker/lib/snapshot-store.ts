import { MemoryCaseStore } from "@siterra/agent";
import type {
  CaseSummary,
  DataBundleRecord,
  EventRecordRowRecord,
  EvidenceRecord,
  HypothesisRecord,
  MeasurementRecord,
} from "@siterra/agent";

import type { Corpus } from "./corpus.ts";
import type { Analyses } from "./recipes.ts";

// A CaseStore for one task run, built from the case snapshot PLATFORM's readSnapshot returns (one
// repeatable-read transaction) and the corpus. Tools then read one consistent view of the case.
// The snapshot type is structural here, so this file does not depend on the contracts package.

export interface SnapshotView {
  case: {
    id: string;
    revision: number;
    title: string;
    objective: string;
    mode: CaseSummary["mode"];
    activeGeoSelectionId: string | null;
    unresolvedQuestions: string[];
  };
  records: {
    dataBundleRecords: DataBundleRecord[];
    measurementRecords: MeasurementRecord[];
    temporalObservationRecords: {
      dataBundleId: string;
      periodId: string;
      qualityFlags: string[];
    }[];
    /** Source records; `language` (contracts 1.5.0) decides the machine-drafted translation label. */
    sourceRecords: { id: string; revision: number; language?: string | undefined }[];
    /** Evidence records, for read_evidence; absent means none. */
    evidenceRecords?: EvidenceRecord[];
    /** Hypotheses, for the intervention feasibility task; absent means none. */
    hypothesisRecords?: HypothesisRecord[];
    /** Event record rows of validated event bundles, for read_event_record; absent means none. */
    eventRecordRowRecords?: EventRecordRowRecord[];
  };
}

export function snapshotStore(
  snapshot: SnapshotView,
  corpus: Corpus,
  analyses: Analyses | null = null,
): MemoryCaseStore {
  const store = new MemoryCaseStore();
  const caseId = snapshot.case.id;
  store.cases.set(caseId, {
    id: caseId,
    revision: snapshot.case.revision,
    title: snapshot.case.title,
    objective: snapshot.case.objective,
    mode: snapshot.case.mode,
    activeGeoSelectionId: snapshot.case.activeGeoSelectionId,
    unresolvedQuestions: snapshot.case.unresolvedQuestions,
  });
  store.bundles.push(...snapshot.records.dataBundleRecords);
  store.measurements.push(...snapshot.records.measurementRecords);
  for (const t of snapshot.records.temporalObservationRecords) {
    store.quality.push({
      caseId,
      bundleId: t.dataBundleId,
      periodId: t.periodId,
      qualityFlags: t.qualityFlags,
    });
  }
  // The case record is authoritative: its Source.language wins over the corpus manifest's.
  const records = new Map(snapshot.records.sourceRecords.map((s) => [s.id, s]));
  for (const source of corpus.sources) {
    const record = records.get(source.id);
    if (!record) continue;
    store.sources.push({ ...source, language: record.language ?? source.language, caseId });
  }
  for (const passage of corpus.passages) {
    if (records.has(passage.sourceId)) store.passages.push({ ...passage, caseId });
  }
  store.evidence.push(...(snapshot.records.evidenceRecords ?? []));
  store.hypotheses.push(...(snapshot.records.hypothesisRecords ?? []));
  store.eventRows.push(...(snapshot.records.eventRecordRowRecords ?? []));
  if (analyses) {
    store.recipes.push(...analyses.recipes);
    store.recipeResults.push(...analyses.results.map((r) => ({ ...r, caseId })));
  }
  return store;
}
