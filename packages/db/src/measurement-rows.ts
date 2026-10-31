// Reads recipe results as Measurement records. A row of data/case/measurement-rows.json names a
// number by bundle, asset key and JSON pointer; this module opens the asset through the checksum
// verification the read API uses, follows the pointer and copies the number. It never computes a
// value and no value is typed in a row, so a wrong pointer changes the record, not a hidden copy.
import { readFileSync } from "node:fs";
import { Measurement, type GeoSelection } from "@siterra/contracts";
import { z } from "zod";
import type { ImportIssue, ImportedBundle } from "./bundle-import.ts";
import { resolveBundleAsset } from "./case-assets.ts";

const id = z.string().regex(/^[a-z][a-z0-9_]*$/);
const pointer = z.string().regex(/^(\/[^/]*)+$/);
const yearOrMonth = z.string().regex(/^[0-9]{4}(-[0-9]{2})?$/);

export const MeasurementRow = z
  .strictObject({
    rowId: id,
    bundleId: z.string(),
    assetKey: z.string().min(1),
    pointer,
    lowerPointer: pointer.nullable(),
    upperPointer: pointer.nullable(),
    /**
     * Where the asset states the claim kind. Null only on the bundle's own collection, the one
     * document that cannot state one: the row then states it and nothing is read back.
     */
    claimKindPointer: pointer.nullable(),
    claimKind: z.string().min(1),
    metric: id,
    unit: z.string().min(1),
    aggregation: z.string().min(1),
    stratum: z.string().min(1),
    period: z.strictObject({
      start: yearOrMonth,
      end: yearOrMonth,
      window: z.string().min(1).nullable(),
    }),
    periodId: z.string(),
    uncertainty: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("interval"),
        level: z.number().gt(0).lt(1),
        method: z.string().min(1),
      }),
      z.strictObject({ kind: z.literal("not_quantified") }),
    ]),
    spatialResolutionM: z.number().gt(0).nullable(),
    usedBy: z.array(z.string().min(1)),
  })
  .refine((row) => row.claimKindPointer !== null || row.assetKey === "collection", {
    message: "Only a row on the bundle's collection may leave the claim kind pointer null",
    path: ["claimKindPointer"],
  });

export type MeasurementRow = z.infer<typeof MeasurementRow>;

export const MeasurementRowsFile = z.strictObject({
  measurementRowsVersion: z.literal(1),
  caseId: z.string(),
  description: z.string(),
  rows: z.array(MeasurementRow),
});
export type MeasurementRowsFile = z.infer<typeof MeasurementRowsFile>;

/** The value an RFC 6901 pointer names in a parsed JSON document, or undefined when none. */
export function readPointer(document: unknown, pointerText: string): unknown {
  let node: unknown = document;
  for (const raw of pointerText.split("/").slice(1)) {
    const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(node)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;
      node = node[Number(token)];
    } else if (typeof node === "object" && node !== null) {
      if (!Object.hasOwn(node, token)) return undefined;
      node = (node as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * One Measurement per row, with the value (and interval) read from the bundle asset. A row that
 * cannot be resolved is reported and skipped; the rest still load, so the caller decides whether a
 * partial seed is acceptable.
 */
export function readMeasurementRows(args: {
  rows: MeasurementRowsFile;
  caseId: string;
  bundlesDir: string;
  bundles: readonly ImportedBundle[];
  geoSelection: Pick<GeoSelection, "id" | "revision">;
  importedAt: string;
}): { measurements: Map<string, Measurement[]>; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const measurements = new Map<string, Measurement[]>();
  const seen = new Set<string>();
  const documents = new Map<string, unknown>();
  for (const row of args.rows.rows) {
    const issue = (message: string) =>
      issues.push({ bundleId: row.bundleId, path: `measurement-rows/${row.rowId}`, message });
    if (seen.has(row.rowId)) {
      issue("Row ID is used twice");
      continue;
    }
    seen.add(row.rowId);
    if ((row.lowerPointer === null) !== (row.upperPointer === null)) {
      issue("lowerPointer and upperPointer are both present or both null");
      continue;
    }
    if ((row.uncertainty.kind === "interval") !== (row.lowerPointer !== null)) {
      issue("An interval row has both interval pointers and a not_quantified row has none");
      continue;
    }
    const bundle = args.bundles.find((b) => b.dataBundle.id === row.bundleId);
    if (bundle === undefined) {
      issue("Bundle is not in the case");
      continue;
    }
    const contentHash = bundle.dataBundle.contentHash;
    if (contentHash === null) {
      issue("The bundle in the case has no content hash to verify the asset against");
      continue;
    }
    const key = JSON.stringify([row.bundleId, row.assetKey]);
    let document = documents.get(key);
    if (document === undefined) {
      const resolved = resolveBundleAsset(args.bundlesDir, {
        bundleId: row.bundleId,
        contentHash,
        assetKey: row.assetKey,
      });
      if (resolved.status !== "available") {
        issue(`Asset ${row.assetKey} cannot be read: ${resolved.status}`);
        continue;
      }
      try {
        document = JSON.parse(readFileSync(resolved.file.absolutePath, "utf8"));
      } catch {
        issue(`Asset ${row.assetKey} is not JSON`);
        continue;
      }
      documents.set(key, document);
    }
    const number = (path: string): number | null => {
      const found = readPointer(document, path);
      if (typeof found === "number" && Number.isFinite(found)) return found;
      issue(`${path} does not name a finite number in ${row.assetKey}`);
      return null;
    };
    const claimKind =
      row.claimKindPointer === null ? row.claimKind : readPointer(document, row.claimKindPointer);
    if (claimKind !== row.claimKind) {
      issue(
        `Claim kind at ${row.claimKindPointer} is ${JSON.stringify(claimKind)}, not ${row.claimKind}`,
      );
      continue;
    }
    const value = number(row.pointer);
    const lower = row.lowerPointer === null ? null : number(row.lowerPointer);
    const upper = row.upperPointer === null ? null : number(row.upperPointer);
    if (value === null || (row.lowerPointer !== null && (lower === null || upper === null))) {
      continue;
    }
    const parsed = Measurement.safeParse({
      recordType: "Measurement",
      id: `meas_${row.rowId}`,
      revision: 1,
      createdAt: args.importedAt,
      updatedAt: args.importedAt,
      caseId: args.caseId,
      metric: row.metric,
      value,
      unit: row.unit,
      status: "available",
      missingReason: null,
      geoSelectionId: args.geoSelection.id,
      geoRevision: args.geoSelection.revision,
      periodId: row.periodId,
      dataBundleId: row.bundleId,
      aggregation: row.aggregation,
      validPixelCount: null,
      totalPixelCount: null,
      validFraction: null,
      spatialResolutionM: row.spatialResolutionM,
      uncertainty:
        row.uncertainty.kind === "interval"
          ? {
              kind: "interval",
              lower,
              upper,
              level: row.uncertainty.level,
              method: row.uncertainty.method,
            }
          : { kind: "not_quantified", lower: null, upper: null, level: null, method: null },
      provenance: {
        ...bundle.dataBundle.provenance,
        inputVersions: [
          ...bundle.dataBundle.provenance.inputVersions,
          { entityId: row.bundleId, revision: bundle.dataBundle.revision },
        ],
      },
      source: {
        assetKey: row.assetKey,
        jsonPointer: row.pointer,
        stratum: row.stratum,
        claimKind: row.claimKind,
        period: row.period,
        lowerJsonPointer: row.lowerPointer,
        upperJsonPointer: row.upperPointer,
      },
    });
    if (!parsed.success) {
      for (const e of parsed.error.issues) issue(`${e.path.join("/")}: ${e.message}`);
      continue;
    }
    const list = measurements.get(row.bundleId) ?? [];
    list.push(parsed.data);
    measurements.set(row.bundleId, list);
  }
  return { measurements, issues };
}
