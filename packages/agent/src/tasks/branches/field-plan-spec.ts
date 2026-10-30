import type { CaseAnalysisConfig } from "@siterra/contracts";
import { composeInstruments } from "@siterra/domain";

import type {
  BranchMergeRecord,
  EvidenceRecord,
  HypothesisRecord,
  InstrumentSpecRecord,
} from "../records.ts";
import type { CaseStore } from "../../tools/store.ts";

// The field plan instrument, written by host code in the commit that writes the branch merge it
// opens (docs/reference/data-contracts.md, composing instruments). The same composer and the same
// configuration rule the seed and the read API use decide it, so a merge with a field plan opens
// the instrument the way the other four open from the seed, and a merge the composer cannot open
// writes nothing (the read API then names the reasons). No model writes any of it.

export async function composeFieldPlanSpec(args: {
  store: CaseStore;
  caseId: string;
  config: CaseAnalysisConfig;
  merge: BranchMergeRecord;
  hypotheses: readonly HypothesisRecord[];
  /** Accepted Evidence earlier tasks of this command committed; the store's view predates them. */
  committedEvidence: readonly EvidenceRecord[];
  at: string;
}): Promise<InstrumentSpecRecord | null> {
  const { store, caseId, config, merge, hypotheses, at } = args;
  const rules = (config.instruments ?? []).filter((r) => r.from === "branch_merge");
  if (rules.length === 0) return null;

  const summary = await store.readCase(caseId);
  const evidenceIds = [
    ...new Set([
      ...hypotheses.flatMap((h) => [...h.supportingEvidenceIds, ...h.contradictingEvidenceIds]),
      ...(await store.listOpenGapIds(caseId)),
    ]),
  ];
  const evidence = new Map(
    [
      ...(await store.readEvidence(caseId, evidenceIds)),
      ...args.committedEvidence.filter((e) => e.caseId === caseId),
    ].map((e) => [e.id, e]),
  );
  const measurements = await store.readMeasurementsById(caseId, [
    ...new Set(hypotheses.flatMap((h) => h.measurementIds ?? [])),
  ]);

  const result = composeInstruments({
    caseId,
    config: { ...config, instruments: rules },
    openExplanationIds: config.explanations.map((e) => e.id),
    geoSelectionId: summary?.activeGeoSelectionId ?? "",
    geoSelections: await store.listGeoSelections(caseId),
    dataBundles: [],
    contextFeatures: [],
    measurements,
    evidence: [...evidence.values()],
    branchMerges: [merge],
    hypotheses,
    hasAsset: () => true,
    now: at,
  });
  const spec = result.specs.find((s) => s.parameters.kind === "field_plan");
  if (spec === undefined) return null;

  const before = (await store.listInstrumentSpecs(caseId)).find((s) => s.id === spec.id);
  return before === undefined
    ? spec
    : { ...spec, revision: before.revision + 1, createdAt: before.createdAt };
}
