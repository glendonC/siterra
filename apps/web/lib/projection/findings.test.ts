import { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import seed from "../../../../packages/contracts/fixtures/case-snapshot-aitbouguemez-seed.json";
import { projectFindings } from "./findings";

const base = CaseSnapshot.parse(seed);

describe("projectFindings", () => {
  it("projects accepted findings for a command with numbered source and measurement chips", () => {
    const srcId = base.records.sourceRecords[0]?.id ?? "src_SCI-04";
    const measId = base.records.measurementRecords[0]?.id ?? "meas_1";
    const bundleId = base.records.dataBundleRecords[0]?.id ?? "bundle_1";
    const snapshot = {
      ...base,
      records: {
        ...base.records,
        taskRecords: [
          {
            id: "task_obs",
            commandId: "cmd_1",
            kind: "observation_analysis",
            status: "succeeded",
            question: "Q",
            failureCode: null,
            missingInputs: [],
            createdAt: "2026-10-28T12:00:00Z",
          },
        ],
        evidenceRecords: [
          {
            recordType: "Evidence",
            id: "ev_1",
            revision: 1,
            createdAt: "2026-10-28T12:00:01Z",
            updatedAt: "2026-10-28T12:00:01Z",
            caseId: base.case.id,
            statement: "Catchment rainfall in 2021/22 was 650.4 mm.",
            claimKind: "observation",
            status: "accepted",
            geoSelectionId: base.case.activeGeoSelectionId,
            periodIds: ["period_2022-04"],
            measurementIds: [measId],
            provenance: {
              sourceLocators: [
                {
                  sourceId: srcId,
                  locator: "p. 4",
                  excerpt: "Seasonal pastoral rules govern high pastures.",
                },
              ],
              dataBundleIds: [bundleId],
              methodId: "chirps_monthly",
              methodVersion: "1.0.0",
              inputVersions: [],
              generatedByTaskId: "task_obs",
              generatedAt: "2026-10-28T12:00:01Z",
              verificationStatus: "source_checked",
              limitations: [],
            },
            interpretation: null,
            uncertainty: "Grid cells are 5 km across.",
            reviewDecisionIds: [],
          },
        ],
      },
    } as unknown as CaseSnapshot;

    const projected = projectFindings(snapshot, "cmd_1");
    expect(projected.items).toHaveLength(1);
    expect(projected.items[0]?.statement).toBe("Catchment rainfall in 2021/22 was 650.4 mm.");
    expect(projected.items[0]?.citationNumbers).toEqual([1, 2]);
    expect(projected.citations).toHaveLength(2);
    expect(projected.citations[0]).toMatchObject({
      index: 1,
      kind: "source",
      recordId: srcId,
      locator: "p. 4",
      detail: "Seasonal pastoral rules govern high pastures.",
    });
    expect(projected.citations[1]).toMatchObject({
      index: 2,
      kind: "measurement",
      recordId: measId,
    });
  });

  it("ignores provisional or rejected evidence and evidence from other commands", () => {
    const snapshot = {
      ...base,
      records: {
        ...base.records,
        taskRecords: [
          {
            id: "task_other",
            commandId: "cmd_other",
            kind: "observation_analysis",
            status: "succeeded",
            question: "Q",
            failureCode: null,
            missingInputs: [],
            createdAt: "2026-10-28T12:00:00Z",
          },
        ],
      },
    } as unknown as CaseSnapshot;
    expect(projectFindings(snapshot, "cmd_1").items).toEqual([]);
  });
});
