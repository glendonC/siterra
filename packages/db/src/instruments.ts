// The read side of the instruments (contracts 1.11.0; data-contracts.md, instruments, INST-04): the
// instrument specs of a case as of one case revision, each bundle asset they name resolved against
// the bundle revision the spec pins, and a bundle asset by its key. Reads only; nothing here writes.
import type {
  BranchMerge,
  CanvasComponent,
  ContextFeature,
  DataBundle,
  Evidence,
  GeoSelection,
  Hypothesis,
  InstrumentAsset,
  InstrumentListing,
  InstrumentSpec,
  Measurement,
} from "@siterra/contracts";
import { isInstrumentKind } from "@siterra/contracts";
import { composeInstruments, instrumentAssetRefs } from "@siterra/domain";
import { analysisConfigFor } from "@siterra/domain/cases";
import { analysisCaseIdOf } from "./case-origin.ts";
import { type CaseAssetFile, resolveBundleAsset } from "./case-assets.ts";
import { type Pool, inTransaction } from "./client.ts";

type Tx = Parameters<Parameters<typeof inTransaction>[1]>[0];

/**
 * What the composer cannot open from the case's records now, in its own words: the case
 * configuration's rules run over the latest records as of one revision. Null for a case with no
 * configuration. Reads only; nothing is written and no spec is returned from here.
 */
async function composition(
  tx: Tx,
  args: { caseId: string; bundlesDir: string | null },
  asOf: number,
): Promise<Pick<InstrumentListing, "blocked" | "notOpened"> | null> {
  const config = analysisConfigFor(await analysisCaseIdOf(tx, args.caseId));
  if (config === null) return null;
  const types = [
    "GeoSelection",
    "DataBundle",
    "ContextFeature",
    "Measurement",
    "Evidence",
    "BranchMerge",
    "Hypothesis",
  ];
  const rows = await tx.query<{ record_type: string; record: unknown }>(
    `select record_type, record from (
       select distinct on (entity_id) entity_id, record_type, record from records
       where case_id = $1 and record_type = any($2::text[]) and case_revision <= $3
       order by entity_id, revision desc
     ) latest`,
    [args.caseId, types, asOf],
  );
  const of = <T>(type: string): T[] =>
    rows.rows.filter((r) => r.record_type === type).map((r) => r.record as T);
  const caseRow = await tx.query<{ record: { activeGeoSelectionId: string | null } }>(
    "select record from cases where id = $1",
    [args.caseId],
  );
  const bundles = of<DataBundle>("DataBundle");
  const result = composeInstruments({
    caseId: args.caseId,
    config,
    openExplanationIds: config.explanations.map((e) => e.id),
    geoSelectionId: caseRow.rows[0]?.record.activeGeoSelectionId ?? "",
    geoSelections: of<GeoSelection>("GeoSelection"),
    dataBundles: bundles,
    contextFeatures: of<ContextFeature>("ContextFeature"),
    measurements: of<Measurement>("Measurement"),
    evidence: of<Evidence>("Evidence"),
    branchMerges: of<BranchMerge>("BranchMerge"),
    hypotheses: of<Hypothesis>("Hypothesis"),
    hasAsset: (ref) => {
      const bundle = bundles.find((b) => b.id === ref.bundleId);
      if (args.bundlesDir === null || bundle === undefined || bundle.contentHash === null) {
        return false;
      }
      return (
        resolveBundleAsset(args.bundlesDir, {
          bundleId: ref.bundleId,
          contentHash: bundle.contentHash,
          assetKey: ref.assetKey,
        }).status === "available"
      );
    },
    now: "1970-01-01T00:00:00.000Z",
  });
  return {
    blocked: result.blocked.map((b) => ({ ruleId: b.ruleId, kind: b.kind, reasons: b.reasons })),
    notOpened: result.notOpened,
  };
}

const sectionOrder = ["place", "observations", "explanations", "responses", "next_steps"] as const;

function unavailable(
  ref: { bundleId: string; assetKey: string },
  status: Exclude<InstrumentAsset["status"], "available">,
): InstrumentAsset {
  return { ...ref, status, href: null, contentType: null, checksum: null, size: null };
}

/**
 * One asset a spec names, resolved against the bundle revision the spec pins in
 * provenance.inputVersions: the bundle must be in the case and validated, its collection must list
 * the key, and the file must match the checksum the collection lists. Anything less is named.
 */
function resolveAsset(
  ref: { bundleId: string; assetKey: string },
  spec: InstrumentSpec,
  bundles: ReadonlyMap<string, DataBundle>,
  bundlesDir: string | null,
): InstrumentAsset {
  const pinned = spec.provenance.inputVersions.find((v) => v.entityId === ref.bundleId);
  const bundle =
    pinned === undefined ? undefined : bundles.get(`${ref.bundleId}@${pinned.revision}`);
  if (bundle === undefined) return unavailable(ref, "bundle_not_in_case");
  if (bundle.status !== "validated") return unavailable(ref, "bundle_not_validated");
  if (bundlesDir === null || bundle.contentHash === null)
    return unavailable(ref, "file_unavailable");
  const found = resolveBundleAsset(bundlesDir, {
    bundleId: ref.bundleId,
    contentHash: bundle.contentHash,
    assetKey: ref.assetKey,
  });
  if (found.status !== "available") return unavailable(ref, found.status);
  return {
    ...ref,
    status: "available",
    href: `/api/case-assets/${ref.bundleId}/${bundle.contentHash}/${found.assetPath}`,
    contentType: found.file.contentType,
    checksum: found.file.checksum,
    size: found.file.size,
  };
}

/**
 * The instrument specs of a case as of a case revision (the current one by default), with the
 * components that bind them and every bundle asset they name resolved. Null when the case does not
 * exist, belongs to another owner, or has not reached the revision asked for.
 */
export async function readInstruments(
  pool: Pool,
  args: {
    caseId: string;
    ownerScopeId: string;
    bundlesDir: string | null;
    revision?: number | undefined;
  },
): Promise<InstrumentListing | null> {
  return inTransaction(
    pool,
    async (tx) => {
      const head = await tx.query<{ revision: number }>(
        "select revision from cases where id = $1 and owner_scope_id = $2",
        [args.caseId, args.ownerScopeId],
      );
      const current = head.rows[0]?.revision;
      if (current === undefined) return null;
      const asOf = args.revision ?? current;
      if (!Number.isInteger(asOf) || asOf < 1 || asOf > current) return null;

      const rows = await tx.query<{ record: InstrumentSpec | CanvasComponent }>(
        `select record from (
           select distinct on (entity_id) entity_id, record from records
           where case_id = $1 and record_type in ('InstrumentSpec', 'CanvasComponent')
             and case_revision <= $2
           order by entity_id, revision desc
         ) latest`,
        [args.caseId, asOf],
      );
      const specs: InstrumentSpec[] = [];
      const components: CanvasComponent[] = [];
      for (const { record } of rows.rows) {
        if (record.recordType === "InstrumentSpec") specs.push(record);
        else if (isInstrumentKind(record.componentKind)) components.push(record);
      }

      const wanted = [
        ...new Set(specs.flatMap((s) => instrumentAssetRefs(s).map((ref) => ref.bundleId))),
      ];
      const bundles = new Map<string, DataBundle>();
      if (wanted.length > 0) {
        const found = await tx.query<{ record: DataBundle }>(
          `select record from records
           where case_id = $1 and record_type = 'DataBundle' and entity_id = any($2::text[])
             and case_revision <= $3`,
          [args.caseId, wanted, asOf],
        );
        for (const { record } of found.rows) bundles.set(`${record.id}@${record.revision}`, record);
      }

      const rank = (c: CanvasComponent) => sectionOrder.indexOf(c.section);
      const bound = (spec: InstrumentSpec) =>
        components
          .filter((c) => c.entityVersions[0]?.entityId === spec.id)
          .sort((a, b) => rank(a) - rank(b) || a.order - b.order || (a.id < b.id ? -1 : 1));
      // What the composer cannot open is a statement about the case now, so only the current revision has it
      const now = asOf === current ? await composition(tx, args, asOf) : null;
      return {
        caseId: args.caseId,
        caseRevision: asOf,
        ...(now ?? {}),
        instruments: specs
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((spec) => ({
            spec,
            components: bound(spec),
            assets: instrumentAssetRefs(spec).map((ref) =>
              resolveAsset(ref, spec, bundles, args.bundlesDir),
            ),
          })),
      };
    },
    "repeatable read",
  );
}

/**
 * The file a bundle's collection lists under an asset key, for a case of the owner that holds the
 * bundle at a validated revision: the case's current revision of the bundle decides which
 * collection answers. Null when the case, the bundle or the key is not there, the bundle is not
 * validated, or the file does not match its checksum.
 */
export async function findCaseBundleAsset(
  pool: Pool,
  args: {
    caseId: string;
    ownerScopeId: string;
    bundleId: string;
    assetKey: string;
    bundlesDir: string | null;
  },
): Promise<CaseAssetFile | null> {
  if (args.bundlesDir === null) return null;
  const result = await pool.query<{ record: DataBundle }>(
    `select r.record from records r join cases c on c.id = r.case_id
     where c.id = $1 and c.owner_scope_id = $2 and r.record_type = 'DataBundle' and r.entity_id = $3
     order by r.revision desc limit 1`,
    [args.caseId, args.ownerScopeId, args.bundleId],
  );
  const bundle = result.rows[0]?.record;
  if (bundle?.status !== "validated" || bundle.contentHash === null) return null;
  const found = resolveBundleAsset(args.bundlesDir, {
    bundleId: args.bundleId,
    contentHash: bundle.contentHash,
    assetKey: args.assetKey,
  });
  return found.status === "available" ? found.file : null;
}
