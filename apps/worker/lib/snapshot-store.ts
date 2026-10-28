import { MemoryCaseStore } from "@siterra/agent";
import type { CaseSummary, DataBundleRecord, MeasurementRecord } from "@siterra/agent";

import type { Corpus } from "./corpus.ts";

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
    sourceRecords: { id: string; revision: number }[];
  };
}

export function snapshotStore(snapshot: SnapshotView, corpus: Corpus): MemoryCaseStore {
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
  const inCase = new Set(snapshot.records.sourceRecords.map((s) => s.id));
  for (const source of corpus.sources) {
    if (inCase.has(source.id)) store.sources.push({ ...source, caseId });
  }
  for (const passage of corpus.passages) {
    if (inCase.has(passage.sourceId)) store.passages.push({ ...passage, caseId });
  }
  return store;
}
