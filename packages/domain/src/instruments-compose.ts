// The deterministic composer of instrument records (data-contracts.md, instruments). The case
// configuration lists rules; each rule names the parameters of one instrument (IDs, asset keys and
// fixed words only) and a caption with slots for cited Measurements. This module checks that every
// record a rule names exists in the case, builds the caption by writing each cited number rounded
// once, half away from zero, and returns complete InstrumentSpecs; a rule whose inputs are missing
// is reported as blocked with the reason, never filled in. No model is involved.
import type {
  BranchMerge,
  BundleAssetRef,
  CaptionNumber,
  CaseAnalysisConfig,
  ContextFeature,
  DataBundle,
  Evidence,
  GeoSelection,
  InstrumentRule,
  InstrumentSpec,
  Measurement,
} from "@siterra/contracts";
import { InstrumentSpec as InstrumentSpecSchema } from "@siterra/contracts";

import {
  instrumentAssetRefs,
  instrumentReferencedIds,
  instrumentSpecIssues,
  uncitedInstrumentInputs,
} from "./instruments.ts";
import { prohibitedHits, unprovenNumbers } from "./validators/index.ts";

export const composerMethodId = "instrument_composer";
export const composerMethodVersion = "1";

export type ComposeInputs = {
  caseId: string;
  config: CaseAnalysisConfig;
  /** Explanations in play for this case; each rule opens when it names one of them. */
  openExplanationIds: readonly string[];
  /** The case's area, used by the rules that do not name one. */
  geoSelectionId: string;
  geoSelections: readonly GeoSelection[];
  dataBundles: readonly DataBundle[];
  contextFeatures: readonly ContextFeature[];
  measurements: readonly Measurement[];
  evidence: readonly Evidence[];
  branchMerges: readonly BranchMerge[];
  /** True when the bundle's collection lists the asset key (the db layer answers from the manifest). */
  hasAsset: (ref: BundleAssetRef) => boolean;
  now: string;
};

export type BlockedInstrument = {
  ruleId: string;
  kind: InstrumentSpec["parameters"]["kind"];
  reasons: string[];
};
export type ComposeResult = {
  specs: InstrumentSpec[];
  blocked: BlockedInstrument[];
  /** Rules whose explanations are not in play. */
  notOpened: string[];
};

/** A value rounded once, half away from zero, on its decimal text (0.02675 to 4 places is 0.0268). */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  const rounded = Math.round(Number(`${Math.abs(value)}e${decimals}`));
  return Math.sign(value) * Number(`${rounded}e-${decimals}`);
}

const slot = /\{([a-z][a-z0-9_]{0,29})\}/g;
/** The words the case copy bans on screen (the bundles' forbidden list), beyond the validators' claim rules. */
const bannedWords =
  /\b(?:significant(?:ly)?|degradation detected|grazing impact|overgrazing|caused by|proves?|recovery|forecast|pasture improvement|pasture decline|encroachment)\b/i;
const pointRoles = new Set(["outlet", "settlement", "settlement_locator", "viewpoint", "summit"]);

type Named = {
  id: string;
  recordType: "GeoSelection" | "DataBundle" | "ContextFeature" | "Evidence" | "BranchMerge";
  role?: string;
};

/** The records the parameters name with the type each must have (INST-07), without the caption. */
function parameterRecords(p: InstrumentSpec["parameters"]): Named[] {
  const geo = (id: string): Named => ({ id, recordType: "GeoSelection" });
  const bundle = (ref: BundleAssetRef): Named => ({ id: ref.bundleId, recordType: "DataBundle" });
  const feature = (id: string, role: string): Named => ({ id, recordType: "ContextFeature", role });
  const places = (ids: readonly string[]): Named[] => ids.map((id) => feature(id, "point"));
  switch (p.kind) {
    case "layer_stack":
      return [
        geo(p.geoSelectionId),
        bundle(p.relief),
        ...p.layers.map((l) => bundle(l.data)),
        ...p.drainageFeatureIds.map((id) => feature(id, "drainage")),
        ...places(p.placeFeatureIds),
      ];
    case "cross_section":
      return [
        geo(p.geoSelectionId),
        feature(p.transectFeatureId, "transect"),
        bundle(p.relief),
        bundle(p.profile),
        bundle(p.bands),
        bundle(p.bandTrends),
        bundle(p.snow),
        ...p.drainageFeatureIds.map((id) => feature(id, "drainage")),
        ...places(p.placeFeatureIds),
        ...p.statements.map((s): Named => ({ id: s.evidenceId, recordType: "Evidence" })),
      ];
    case "pixel_anatomy":
      return [
        geo(p.geoSelectionId),
        bundle(p.locator),
        bundle(p.anatomy),
        bundle(p.bandSeries),
        ...p.contextEvidenceIds.map((id): Named => ({ id, recordType: "Evidence" })),
      ];
    case "rainfall_scatter":
      return [geo(p.geoSelectionId), bundle(p.seasons), bundle(p.fit)];
    case "field_plan":
      return [
        geo(p.geoSelectionId),
        { id: p.branchMergeId, recordType: "BranchMerge" },
        ...p.routeFeatureIds.map((id) => feature(id, "route_proposed")),
      ];
  }
}

function numberPart(m: Measurement, part: CaptionNumber["part"]): number | null {
  if (m.status !== "available" || m.value === null) return null;
  return part === "value" ? m.value : part === "lower" ? m.uncertainty.lower : m.uncertainty.upper;
}

/** The caption sentences of a rule with its slots written; reasons when a number cannot be. */
function writeCaption(
  rule: Extract<InstrumentRule, { from: "parameters" }>,
  measurements: Map<string, Measurement>,
): { ink: string; grey: string; allowed: number[]; reasons: string[] } {
  const reasons: string[] = [];
  const allowed: number[] = [];
  const written = new Map<string, string>();
  for (const [name, n] of Object.entries(rule.caption.numbers)) {
    const m = measurements.get(n.measurementId);
    const raw = m === undefined ? null : numberPart(m, n.part);
    if (raw === null) {
      reasons.push(
        m === undefined
          ? `${n.measurementId} is not in the case`
          : `${n.measurementId} has no ${n.part} to show (status ${m.status})`,
      );
      continue;
    }
    const rounded = roundHalfAwayFromZero(raw, n.decimals);
    allowed.push(raw);
    written.set(name, rounded.toFixed(n.decimals));
  }
  const fill = (s: string) =>
    s.replace(slot, (_, name: string) => {
      const value = written.get(name);
      if (value === undefined && !rule.caption.numbers[name])
        reasons.push(`The slot {${name}} has no number`);
      return value ?? "";
    });
  return { ink: fill(rule.caption.ink), grey: fill(rule.caption.grey), allowed, reasons };
}

export function composeInstruments(inputs: ComposeInputs): ComposeResult {
  const rules = inputs.config.instruments ?? [];
  const open = new Set(inputs.openExplanationIds);
  const geo = new Map(inputs.geoSelections.map((r) => [r.id, r]));
  const bundles = new Map(inputs.dataBundles.map((r) => [r.id, r]));
  const features = new Map(inputs.contextFeatures.map((r) => [r.id, r]));
  const measurements = new Map(inputs.measurements.map((r) => [r.id, r]));
  const evidence = new Map(inputs.evidence.map((r) => [r.id, r]));
  const merges = new Map(inputs.branchMerges.map((r) => [r.id, r]));
  const revisions = new Map<string, number>(
    [...geo, ...bundles, ...features, ...measurements, ...evidence, ...merges].map(
      ([id, r]) => [id, r.revision] as const,
    ),
  );

  const result: ComposeResult = { specs: [], blocked: [], notOpened: [] };
  for (const rule of rules) {
    if (!rule.whenExplanationIds.some((id) => open.has(id))) {
      result.notOpened.push(rule.id);
      continue;
    }
    const reasons: string[] = [];
    let parameters: InstrumentSpec["parameters"];
    let caption: {
      ink: string;
      grey: string;
      claimKind: InstrumentSpec["caption"]["claimKind"];
      citationIds: string[];
    };
    let allowed: number[] = [];

    if (rule.from === "parameters") {
      parameters = rule.parameters;
      const written = writeCaption(rule, measurements);
      reasons.push(...written.reasons);
      allowed = written.allowed;
      caption = {
        ink: written.ink,
        grey: written.grey,
        claimKind: rule.caption.claimKind,
        citationIds: [...rule.caption.citationIds],
      };
    } else {
      const merge = [...merges.values()]
        .filter((m) => m.fieldPlan !== undefined)
        .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
      const gaps = [...evidence.values()]
        .filter((e) => e.claimKind === "field_requirement" && e.status === "accepted")
        .map((e) => e.id)
        .sort();
      parameters = {
        kind: "field_plan",
        geoSelectionId: inputs.geoSelectionId,
        branchMergeId: merge?.id ?? "merge_none",
        actionId: null,
        routeFeatureIds: [],
      };
      if (merge === undefined) reasons.push("The case holds no branch merge with a field plan");
      if (gaps.length === 0)
        reasons.push("The case holds no accepted field_requirement Evidence for the plan to cite");
      caption = {
        ink: rule.caption.ink,
        grey: rule.caption.grey,
        claimKind: "field_requirement",
        citationIds: gaps.slice(0, 8),
      };
    }

    // Every record the parameters name exists, has the right type and, for a bundle, is validated.
    for (const named of parameterRecords(parameters)) {
      if (named.recordType === "GeoSelection" && !geo.has(named.id))
        reasons.push(`${named.id} is not a GeoSelection of the case`);
      if (named.recordType === "Evidence" && !evidence.has(named.id))
        reasons.push(`${named.id} is not Evidence of the case`);
      if (named.recordType === "BranchMerge" && !merges.has(named.id) && rule.from === "parameters")
        reasons.push(`${named.id} is not a BranchMerge of the case`);
      if (named.recordType === "DataBundle") {
        const b = bundles.get(named.id);
        if (b === undefined) reasons.push(`The bundle ${named.id} is not in the case`);
        else if (b.status !== "validated")
          reasons.push(`The bundle ${named.id} is ${b.status}, not validated`);
      }
      if (named.recordType === "ContextFeature") {
        const f = features.get(named.id);
        if (f === undefined) reasons.push(`${named.id} is not a ContextFeature of the case`);
        else if (named.role === "point" ? !pointRoles.has(f.role) : f.role !== named.role) {
          reasons.push(
            `${named.id} has the role ${f.role}, not ${named.role === "point" ? "a place role" : String(named.role)}`,
          );
        }
      }
    }
    for (const ref of instrumentAssetRefs({ parameters })) {
      if (bundles.has(ref.bundleId) && !inputs.hasAsset(ref))
        reasons.push(`The bundle ${ref.bundleId} lists no asset ${ref.assetKey}`);
    }
    for (const id of caption.citationIds) {
      if (!evidence.has(id) && !measurements.has(id))
        reasons.push(`${id} is not Evidence or a Measurement of the case`);
    }
    if (caption.ink.length > 200)
      reasons.push(`The ink sentence is ${String(caption.ink.length)} characters, over 200`);
    if (caption.grey.length > 240)
      reasons.push(`The grey sentence is ${String(caption.grey.length)} characters, over 240`);
    for (const [label, sentence] of [
      ["ink", caption.ink],
      ["grey", caption.grey],
    ] as const) {
      for (const hit of prohibitedHits(sentence))
        reasons.push(`The ${label} sentence holds a prohibited phrase: ${hit.phrase}`);
      const banned = bannedWords.exec(sentence);
      if (banned !== null) reasons.push(`The ${label} sentence holds a banned word: ${banned[0]}`);
      const unproven = unprovenNumbers(sentence, allowed, [], null);
      if (unproven.length > 0)
        reasons.push(
          `The ${label} sentence shows numbers no cited record accounts for: ${unproven.join(", ")}`,
        );
    }

    if (reasons.length > 0) {
      result.blocked.push({ ruleId: rule.id, kind: parameters.kind, reasons });
      continue;
    }
    const draft = {
      recordType: "InstrumentSpec" as const,
      id: `inst_${rule.id}`,
      revision: 1,
      createdAt: inputs.now,
      updatedAt: inputs.now,
      caseId: inputs.caseId,
      status: "ready" as const,
      parameters,
      caption,
      provenance: {
        sourceLocators: [],
        dataBundleIds: [...new Set(instrumentAssetRefs({ parameters }).map((r) => r.bundleId))],
        methodId: composerMethodId,
        methodVersion: composerMethodVersion,
        inputVersions: instrumentReferencedIds({ parameters, caption }).flatMap((entityId) => {
          const revision = revisions.get(entityId);
          return revision === undefined ? [] : [{ entityId, revision }];
        }),
        generatedByTaskId: null,
        generatedAt: inputs.now,
        verificationStatus: "computed_checked" as const,
        limitations: ["Composed by host rules from the case configuration; no model wrote it."],
      },
    };
    const parsed = InstrumentSpecSchema.safeParse(draft);
    const issues = parsed.success
      ? [...instrumentSpecIssues(parsed.data), ...uncitedInstrumentInputs(parsed.data)]
      : parsed.error.issues.map((i) => `${i.path.join("/")}: ${i.message}`);
    if (!parsed.success || issues.length > 0) {
      result.blocked.push({ ruleId: rule.id, kind: parameters.kind, reasons: issues });
      continue;
    }
    result.specs.push(parsed.data);
  }
  return result;
}
