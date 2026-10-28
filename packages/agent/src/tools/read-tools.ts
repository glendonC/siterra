import { z } from "zod";

import type { MeasurementRecord } from "../tasks/records.ts";
import type { CaseStore } from "./store.ts";
import { ToolFailure } from "./tool.ts";
import type { ToolHandler } from "./tool.ts";
import { argumentSchema, parseWith } from "./zod-tool.ts";

// read_case, read_dataset_manifest and summarize_observations
// (docs/reference/agent-orchestration.md#tools-and-permissions). Each is bound to one case; every
// value it returns is read from records by code. summarize_observations in this version is the
// per-period lookup only: it aligns and counts stored measurements and computes no new values.

export const MAX_PERIODS = 24;
const PERIOD_ID = /^period_\d{4}-(0[1-9]|1[0-2])$/;

const ReadCaseArgs = z.strictObject({});
type ReadCaseArgs = z.infer<typeof ReadCaseArgs>;

export function readCaseTool(store: CaseStore, caseId: string): ToolHandler<ReadCaseArgs> {
  return {
    name: "read_case",
    description: "Read the summary of the current case: title, objective, mode and open questions.",
    parameters: argumentSchema(ReadCaseArgs),
    parse: (args) => parseWith(ReadCaseArgs, args),
    summarize: () => "current case",
    run: async () => {
      const summary = await store.readCase(caseId);
      if (!summary) throw new ToolFailure("unknown_case", "the case was not found");
      return { output: summary, resultEntityIds: [summary.id] };
    },
  };
}

const ManifestArgs = z.strictObject({ bundleId: z.string() });
type ManifestArgs = z.infer<typeof ManifestArgs>;

export function readDatasetManifestTool(
  store: CaseStore,
  caseId: string,
): ToolHandler<ManifestArgs> {
  return {
    name: "read_dataset_manifest",
    description:
      "Read the manifest of a validated observation bundle in this case: dataset, method, periods, geometry, license and limitations.",
    parameters: argumentSchema(ManifestArgs),
    parse: (args) => parseWith(ManifestArgs, args),
    summarize: (args) => `bundle ${args.bundleId}`,
    run: async (args) => {
      const bundle = await store.readBundle(caseId, args.bundleId);
      if (!bundle)
        throw new ToolFailure("unknown_bundle", `no bundle ${args.bundleId} in this case`);
      if (bundle.status !== "validated") {
        throw new ToolFailure("bundle_not_validated", `bundle ${bundle.id} is ${bundle.status}`);
      }
      return {
        output: {
          bundleId: bundle.id,
          bundleRevision: bundle.revision,
          label: bundle.label,
          datasetId: bundle.datasetId,
          methodId: bundle.methodId,
          methodVersion: bundle.methodVersion,
          geoSelectionId: bundle.geoSelectionId,
          geoRevision: bundle.geoRevision,
          periodIds: bundle.periodIds,
          license: bundle.license,
          attribution: bundle.attribution,
          limitations: bundle.provenance.limitations,
        },
        resultEntityIds: [bundle.id],
      };
    },
  };
}

const SummarizeArgs = z.strictObject({
  bundleId: z.string(),
  bundleRevision: z.number(),
  periodIds: z.array(z.string()),
  metric: z.string().nullable(),
});
type SummarizeArgs = z.infer<typeof SummarizeArgs>;

export interface PeriodRow {
  periodId: string;
  measurementId: string | null;
  measurementRevision: number | null;
  metric: string | null;
  value: number | null;
  unit: string | null;
  status: MeasurementRecord["status"] | "no_record";
  missingReason: string | null;
  validFraction: number | null;
  spread: { kind: string; lower: number | null; upper: number | null } | null;
  qualityFlags: string[];
}

export function summarizeObservationsTool(
  store: CaseStore,
  caseId: string,
): ToolHandler<SummarizeArgs> {
  return {
    name: "summarize_observations",
    description:
      "Per-period values of a validated bundle for up to 24 period IDs: value, unit, status, coverage, spatial spread and quality flags, with counts by status. Values are read from stored measurements.",
    parameters: argumentSchema(SummarizeArgs),
    parse: (args) => {
      const parsed = parseWith(SummarizeArgs, args);
      if (!parsed.ok) return parsed;
      const { periodIds, bundleRevision } = parsed.value;
      if (!Number.isInteger(bundleRevision) || bundleRevision < 1) {
        return { ok: false, message: "$.bundleRevision: must be a positive integer" };
      }
      if (periodIds.length === 0 || periodIds.length > MAX_PERIODS) {
        return { ok: false, message: `$.periodIds: give 1 to ${MAX_PERIODS} period IDs` };
      }
      const bad = periodIds.find((p) => !PERIOD_ID.test(p));
      if (bad !== undefined)
        return { ok: false, message: `$.periodIds: ${bad} is not a period ID` };
      return parsed;
    },
    summarize: (args) =>
      `bundle ${args.bundleId} revision ${args.bundleRevision}, ${args.periodIds.length} ${args.periodIds.length === 1 ? "period" : "periods"}${args.metric ? `, ${args.metric}` : ""}`,
    run: async (args) => {
      const bundle = await store.readBundle(caseId, args.bundleId);
      if (!bundle)
        throw new ToolFailure("unknown_bundle", `no bundle ${args.bundleId} in this case`);
      if (bundle.status !== "validated") {
        throw new ToolFailure("bundle_not_validated", `bundle ${bundle.id} is ${bundle.status}`);
      }
      if (bundle.revision !== args.bundleRevision) {
        throw new ToolFailure(
          "stale_reference",
          `bundle ${bundle.id} is at revision ${bundle.revision}, not ${args.bundleRevision}`,
        );
      }
      const periodIds = [...new Set(args.periodIds)];
      const outside = periodIds.filter((p) => !bundle.periodIds.includes(p));
      if (outside.length > 0) {
        throw new ToolFailure(
          "unknown_period",
          `not in bundle ${bundle.id}: ${outside.join(", ")}`,
        );
      }
      const measurements = (
        await store.readMeasurements(caseId, bundle.id, bundle.revision, periodIds)
      ).filter((m) => args.metric === null || m.metric === args.metric);
      const flags = new Map(
        (await store.readPeriodQuality(caseId, bundle.id, periodIds)).map((q) => [
          q.periodId,
          q.qualityFlags,
        ]),
      );
      const rows: PeriodRow[] = [];
      for (const periodId of periodIds) {
        const found = measurements.filter((m) => m.periodId === periodId);
        if (found.length === 0) {
          rows.push({
            periodId,
            measurementId: null,
            measurementRevision: null,
            metric: args.metric,
            value: null,
            unit: null,
            status: "no_record",
            missingReason: "No stored measurement for this period.",
            validFraction: null,
            spread: null,
            qualityFlags: flags.get(periodId) ?? [],
          });
          continue;
        }
        for (const m of found) {
          rows.push({
            periodId,
            measurementId: m.id,
            measurementRevision: m.revision,
            metric: m.metric,
            value: m.status === "available" ? m.value : null,
            unit: m.unit,
            status: m.status,
            missingReason: m.missingReason,
            validFraction: m.validFraction,
            spread:
              m.uncertainty.kind === "not_quantified"
                ? null
                : {
                    kind: m.uncertainty.kind,
                    lower: m.uncertainty.lower,
                    upper: m.uncertainty.upper,
                  },
            qualityFlags: flags.get(periodId) ?? [],
          });
        }
      }
      const counts: Record<PeriodRow["status"], number> = {
        available: 0,
        missing: 0,
        excluded: 0,
        invalid: 0,
        no_record: 0,
      };
      for (const row of rows) counts[row.status] += 1;
      return {
        output: {
          bundleId: bundle.id,
          bundleRevision: bundle.revision,
          summary: "per_period_values",
          label: "precomputed observation",
          rows,
          counts,
          limitations: bundle.provenance.limitations,
        },
        resultEntityIds: rows.flatMap((r) => (r.measurementId ? [r.measurementId] : [])),
      };
    },
  };
}
