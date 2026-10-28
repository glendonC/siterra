import type {
  DataBundleRecord,
  MeasurementRecord,
  Provenance,
  TaskRecord,
} from "../tasks/records.ts";
import { MemoryCaseStore } from "../tools/store.ts";
import type { StoredPassage } from "../tools/store.ts";

// A synthetic case for tests: IDs use the `test` slug and every value is invented. Nothing here
// is a measurement of any place.

export const CASE_ID = "case_test_valley";
export const AT = new Date("2026-10-27T20:00:00.000Z");

const provenance = (limitations: string[] = []): Provenance => ({
  sourceLocators: [],
  dataBundleIds: [],
  methodId: null,
  methodVersion: null,
  inputVersions: [],
  generatedByTaskId: null,
  generatedAt: AT.toISOString(),
  verificationStatus: "computed_checked",
  limitations,
});

export function bundle(overrides: Partial<DataBundleRecord> = {}): DataBundleRecord {
  return {
    recordType: "DataBundle",
    id: "bundle_test_ndvi",
    revision: 2,
    caseId: CASE_ID,
    label: "Test NDVI bundle",
    status: "validated",
    datasetId: "test-dataset",
    datasetVersion: null,
    sourceIds: [],
    geoSelectionId: "geo_test_catchment",
    geoRevision: 1,
    periodIds: ["period_2022-03", "period_2022-04", "period_2022-05"],
    methodId: "test_ndvi_monthly",
    methodVersion: "0.1.0",
    manifestUri: null,
    contentHash: null,
    license: "test-license",
    attribution: "Synthetic test data",
    provenance: provenance([
      "The spatial IQR is variability across pixels, not a confidence interval.",
    ]),
    ...overrides,
  };
}

export function measurement(
  periodId: string,
  value: number | null,
  overrides: Partial<MeasurementRecord> = {},
): MeasurementRecord {
  const available = value !== null;
  return {
    recordType: "Measurement",
    id: `meas_test_${periodId.slice("period_".length)}`,
    revision: 1,
    caseId: CASE_ID,
    metric: "ndvi_area_median",
    value,
    unit: "1",
    status: available ? "available" : "missing",
    missingReason: available ? null : "Less than 70% of the catchment had 3 clear dates.",
    geoSelectionId: "geo_test_catchment",
    geoRevision: 1,
    periodId,
    dataBundleId: "bundle_test_ndvi",
    aggregation: "Area median",
    validPixelCount: available ? 4000 : null,
    totalPixelCount: 5000,
    validFraction: available ? 0.8 : null,
    spatialResolutionM: 10,
    uncertainty: available
      ? { kind: "spatial_iqr", lower: 0.1076, upper: 0.1937, level: null, method: "spatial IQR" }
      : { kind: "not_quantified", lower: null, upper: null, level: null, method: null },
    provenance: provenance(),
    ...overrides,
  };
}

export function testStore(): MemoryCaseStore {
  const store = new MemoryCaseStore();
  store.cases.set(CASE_ID, {
    id: CASE_ID,
    revision: 3,
    title: "Test case",
    objective: "Test objective.",
    mode: "replay",
    activeGeoSelectionId: "geo_test_catchment",
    unresolvedQuestions: [],
  });
  store.bundles.push(bundle());
  store.measurements.push(
    measurement("period_2022-03", 0.1211),
    measurement("period_2022-04", 0.1439),
    measurement("period_2022-05", null),
  );
  store.quality.push({
    caseId: CASE_ID,
    bundleId: "bundle_test_ndvi",
    periodId: "period_2022-04",
    qualityFlags: ["snow_suspected"],
  });
  store.sources.push(
    {
      caseId: CASE_ID,
      id: "src_test_report",
      revision: 1,
      title: "Synthetic French report",
      accessStatus: "retrieved",
      language: "fr",
      redistributionStatus: "permitted",
      documents: [{ name: "report.pdf", kind: "pdf", pageCount: 3, sections: [] }],
    },
    {
      caseId: CASE_ID,
      id: "src_test_page",
      revision: 1,
      title: "Synthetic web page",
      accessStatus: "retrieved",
      language: null,
      redistributionStatus: "permitted",
      documents: [{ name: "notes.html", kind: "text", pageCount: null, sections: ["Closures"] }],
    },
    {
      caseId: CASE_ID,
      id: "src_test_paywalled",
      revision: 1,
      title: "Synthetic unavailable article",
      accessStatus: "unavailable",
      language: "en",
      redistributionStatus: "unknown",
      documents: [{ name: "article.pdf", kind: "pdf", pageCount: 12, sections: [] }],
    },
  );
  const passage = (sourceId: string, locator: StoredPassage["locator"], text: string) => ({
    caseId: CASE_ID,
    sourceId,
    locator,
    text,
    textSha256: "test",
  });
  store.passages.push(
    passage("src_test_report", { document: "report.pdf", page: 1 }, "Introduction synthetique."),
    passage(
      "src_test_report",
      { document: "report.pdf", page: 2 },
      "Le p\u00e2turage collectif est\nr\u00e9gl\u00e9 par une   fermeture saisonni\u00e8re\u00a0de 3 mois.",
    ),
    passage(
      "src_test_page",
      { document: "notes.html", section: "Closures" },
      "Closures last for 3 months in this synthetic page.",
    ),
    passage("src_test_paywalled", { document: "article.pdf", page: 1 }, "Not readable."),
  );
  return store;
}

export function queuedTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    recordType: "Task",
    id: "task_test_observations",
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    commandId: "cmd_test_commission",
    kind: "observation_analysis",
    question: "What did the catchment NDVI show in spring 2022?",
    status: "running",
    dependsOnTaskIds: [],
    inputVersions: [{ entityId: "bundle_test_ndvi", revision: 2 }],
    allowedTools: ["read_dataset_manifest", "summarize_observations", "propose_evidence"],
    outputEntityIds: [],
    idempotencyKey: "test-observations-0001",
    attempt: 1,
    maxModelRounds: 6,
    deadlineAt: "2026-10-27T20:03:00.000Z",
    budgetMicroUsd: 500_000,
    spentMicroUsd: 0,
    checkpointId: null,
    failureCode: null,
    missingInputs: [],
    startedAt: AT.toISOString(),
    finishedAt: null,
    ...overrides,
  };
}
