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
  Hypothesis,
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

/** The phrases of `text` that the shared prohibited-claim rules match (empty when it makes none). */
export function prohibitedHitsIn(text: string): string[] {
  return prohibitedHits(text).map((hit) => hit.phrase);
}

export const composerMethodId = "instrument_composer";
export const composerMethodVersion = "1";

export type ComposeInputs = {
  caseId: string;
  config: CaseAnalysisConfig;
  /** Explanations in play for this case; each rule opens when it names one of them. */
  openExplanationIds: readonly string[];
  /** The case's area, used by the rules that do not name one. */
  geoSelectionId: string;
  /** Only the ID and revision are read: the area must exist, and the spec cites its revision. */
  geoSelections: readonly Pick<GeoSelection, "id" | "revision">[];
  dataBundles: readonly DataBundle[];
  contextFeatures: readonly ContextFeature[];
  measurements: readonly Measurement[];
  evidence: readonly Evidence[];
  branchMerges: readonly BranchMerge[];
  /** The hypotheses the branch task wrote; a field plan cites the records the merge's hypotheses rest on. */
  hypotheses?: readonly Hypothesis[];
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

/**
 * A value rounded once, half away from zero, on its decimal text (0.02675 to 4 places is 0.0268).
 * `shift` moves the decimal point first, so a fraction shown as a percent is rounded on its own
 * digits (0.285 to 0 places as a percent is 29, not 28).
 */
export function roundHalfAwayFromZero(value: number, decimals: number, shift = 0): number {
  const text = String(Math.abs(value));
  // Exponent notation (1e-7) has no decimal text to shift; plain arithmetic is exact enough there.
  const scaled = text.includes("e")
    ? Math.abs(value) * 10 ** (decimals + shift)
    : Number(`${text}e${String(decimals + shift)}`);
  return Math.sign(value) * Number(`${Math.round(scaled)}e-${String(decimals)}`);
}

const slot = /\{([a-z][a-z0-9_]{0,29})\}/g;
/** The words the case copy bans on screen (the bundles' forbidden list), beyond the validators' claim rules. */
export const captionBannedWords =
  /\b(?:significant(?:ly)?|degradation detected|grazing impact|overgrazing|caused by|proves?|recovery|forecast|pasture improvement|pasture decline|encroachment)\b/i;
const pointRoles = new Set(["outlet", "settlement", "settlement_locator", "viewpoint", "summit"]);

type Named = {
  id: string;
  recordType: "GeoSelection" | "DataBundle" | "ContextFeature" | "Evidence" | "BranchMerge";
  role?: string;
};

/** The records the parameters name with the type each must have (INST-07), without the caption. */
function parameterRecords(p: InstrumentSpec["parameters"]): Named[] {
  const drawn: Named[] =
    p.kind === "field_plan"
      ? []
      : (p.drawnAssets ?? []).map((d) => ({ id: d.asset.bundleId, recordType: "DataBundle" }));
  return [...fieldRecords(p), ...drawn];
}

function fieldRecords(p: InstrumentSpec["parameters"]): Named[] {
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
        ...p.statements.flatMap((s): Named[] => [
          { id: s.evidenceId, recordType: "Evidence" },
          ...(s.display?.evidenceIds ?? []).map((id): Named => ({ id, recordType: "Evidence" })),
        ]),
      ];
    case "pixel_anatomy":
      return [
        geo(p.geoSelectionId),
        bundle(p.locator),
        bundle(p.anatomy),
        bundle(p.bandSeries),
        ...p.contextEvidenceIds.map((id): Named => ({ id, recordType: "Evidence" })),
        ...(p.contextDisplay ?? []).flatMap((d) =>
          d.evidenceIds.map((id): Named => ({ id, recordType: "Evidence" })),
        ),
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

type NumberPart =
  "value" | "lower" | "upper" | "level" | "period_start" | "period_end" | "resolution_m";

function numberPart(m: Measurement, part: NumberPart): number | null {
  if (m.status !== "available" || m.value === null) return null;
  switch (part) {
    case "value":
      return m.value;
    case "lower":
      return m.uncertainty.lower;
    case "upper":
      return m.uncertainty.upper;
    case "level":
      return m.uncertainty.level;
    case "resolution_m":
      return m.spatialResolutionM;
    case "period_start":
      return m.source === undefined ? null : Number(m.source.period.start.slice(0, 4));
    case "period_end":
      return m.source === undefined ? null : Number(m.source.period.end.slice(0, 4));
  }
}

/** The decimal text of a value rounded once, half away from zero, in the style the slot asks for. */
function writeNumber(raw: number, decimals: number, style: CaptionNumber["style"]): string {
  const percent = style === "percent";
  const rounded = roundHalfAwayFromZero(raw, decimals, percent ? 2 : 0);
  const text = rounded.toFixed(decimals);
  switch (style) {
    case "percent":
      return `${text}%`;
    case "signed":
      return rounded > 0 ? `+${text}` : text;
    case "grouped": {
      const [whole = "", fraction] = text.split(".");
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return fraction === undefined ? grouped : `${grouped}.${fraction}`;
    }
    default:
      return text;
  }
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
    const reads =
      "sumOf" in n
        ? n.sumOf.map((id) => [id, "value"] as const)
        : [[n.measurementId, n.part] as const];
    const values: number[] = [];
    for (const [id, part] of reads) {
      const m = measurements.get(id);
      const raw = m === undefined ? null : numberPart(m, part);
      if (raw === null) {
        reasons.push(
          m === undefined
            ? `${id} is not in the case`
            : `${id} has no ${part} to show (status ${m.status})`,
        );
      } else {
        values.push(raw);
      }
    }
    if (values.length !== reads.length) continue;
    // A sum is a documented computation over stored fields; 12 significant digits keep the float
    // sum from nudging a value across a rounding half.
    const raw =
      values.length === 1
        ? (values[0] ?? 0)
        : Number(values.reduce((a, b) => a + b, 0).toPrecision(12));
    allowed.push(raw);
    written.set(name, writeNumber(raw, n.decimals, n.style));
  }
  for (const hold of rule.caption.holds ?? []) {
    const m = measurements.get(hold.measurementId);
    const raw = m === undefined ? null : numberPart(m, hold.part);
    if (raw === null) {
      reasons.push(`${hold.measurementId} has no ${hold.part} to check against the caption`);
    } else if (!(raw > hold.above)) {
      reasons.push(
        `${hold.measurementId} ${hold.part} is not above ${String(hold.above)}, but the caption says it is`,
      );
    }
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

/**
 * INST-08: the wording an instrument shows for a statement it places. Every number in it is in an
 * excerpt of an Evidence record it cites, it makes no prohibited claim and uses no banned word, and
 * the Evidence it cites is in the case. The Evidence statement itself is never what is shown.
 */
export function displayTextIssues(
  parameters: InstrumentSpec["parameters"],
  evidence: ReadonlyMap<string, Pick<Evidence, "provenance">>,
): string[] {
  const texts =
    parameters.kind === "cross_section"
      ? parameters.statements.flatMap((s) => (s.display ? [s.display] : []))
      : parameters.kind === "pixel_anatomy"
        ? (parameters.contextDisplay ?? [])
        : [];
  const issues: string[] = [];
  for (const { text, evidenceIds } of texts) {
    const cited = evidenceIds.flatMap((id) => {
      const e = evidence.get(id);
      if (e === undefined) {
        issues.push(`"${text}" cites ${id}, which is not Evidence of the case`);
        return [];
      }
      return [e];
    });
    const excerpts = cited.flatMap((e) =>
      e.provenance.sourceLocators.flatMap((l) => (l.excerpt === null ? [] : [l.excerpt])),
    );
    for (const hit of prohibitedHits(text)) {
      issues.push(`"${text}" holds a prohibited phrase: ${hit.phrase}`);
    }
    const banned = captionBannedWords.exec(text);
    if (banned !== null) issues.push(`"${text}" holds a banned word: ${banned[0]}`);
    const unproven = unprovenNumbers(text, [], excerpts, null);
    if (unproven.length > 0) {
      issues.push(`"${text}" shows numbers no cited excerpt holds: ${unproven.join(", ")}`);
    }
  }
  return issues;
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
      // What the plan cites: the records the merge's own hypotheses rest on (the Measurements their
      // scores read and the Evidence they weigh), and the accepted field requirements of the case.
      const restsOn = (inputs.hypotheses ?? [])
        .filter((h) => merge !== undefined && h.provenance.generatedByTaskId === merge.taskId)
        .flatMap((h) => [
          ...(h.measurementIds ?? []).filter((id) => measurements.has(id)),
          ...[...h.supportingEvidenceIds, ...h.contradictingEvidenceIds].filter((id) =>
            evidence.has(id),
          ),
        ]);
      const gaps = [
        ...new Set([
          ...restsOn,
          ...[...evidence.values()]
            .filter((e) => e.claimKind === "field_requirement" && e.status === "accepted")
            .map((e) => e.id),
        ]),
      ].sort();
      parameters = {
        kind: "field_plan",
        geoSelectionId: inputs.geoSelectionId,
        branchMergeId: merge?.id ?? "merge_none",
        actionId: null,
        routeFeatureIds: [],
      };
      if (merge === undefined) reasons.push("The case holds no branch merge with a field plan");
      if (gaps.length === 0)
        reasons.push(
          "The case holds nothing for the plan to cite: no hypothesis of the merge rests on a record of the case and no field requirement is accepted",
        );
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
    reasons.push(...displayTextIssues(parameters, evidence));
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
      const banned = captionBannedWords.exec(sentence);
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
