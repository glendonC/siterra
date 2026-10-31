// The next-steps package of one question, read from the case record (UI-2 unit 1): the Brief that the question's
// brief task committed, its OperationalAction with the field plan, the ResourceRequirements the action names, the
// candidate responses (Intervention) the brief rests on and the review requests (ReviewDecision). Pure: every line
// here is a record field; nothing is inferred, ranked or rewritten. Lines that cite evidence carry numbered source
// chips by the results' rule (source record, else data bundle, else measurement); lines from the field plan carry
// the plan as their origin. A kind of place is tied to the land only where its record names a data bundle of the
// case (FieldStratum.dataBundleId) and, for a field check, where a measurement names the merge's fieldCheckId.

import type {
  Brief,
  BriefItem,
  CaseSnapshot,
  Evidence,
  Intervention,
  OperationalAction,
  ResourceRequirement,
  ReviewDecision,
} from "@siterra/contracts";
import { readableStatement, shortCitation, sourceKey, sourceNote } from "../overview/results";

type Records = CaseSnapshot["records"];
export type ClaimKind = BriefItem["claimKind"];
export type Role = ReviewDecision["role"];

/** One numbered source a package line cites, with the note its chip opens. */
export interface PackageSource {
  n: number;
  /** A short name for the source line: the study's author and year, or the data bundle's label. */
  short: string;
  /** What the chip numbers: a source id, a data bundle id or a measurement id. */
  key: string;
  note: string;
}

export interface PackageLine {
  text: string;
  claimKind: ClaimKind;
  /** Chip numbers, ascending, into PackageView.sources. */
  chips: number[];
}

export interface PackagePlace {
  key: string;
  label: string;
  definition: string;
  /** The bundle the record ties this kind of place to; null when the record ties it to nothing on the land. */
  bundleId: string | null;
}

export interface PackageMeasure {
  what: string;
  method: string;
  season: string;
  fieldRole: string;
  places: PackagePlace[];
  /** The merge's field check this measurement serves, when its record names one the case holds. */
  fieldCheck: { id: string; label: string } | null;
  /** The open gaps (field requirement evidence) it answers, as their statements read. */
  answers: string[];
  chips: number[];
}

export interface PackageResource {
  id: string;
  label: string;
  kind: ResourceRequirement["resourceKind"];
  estimate: ResourceRequirement["estimateStatus"];
  /** "3 days" when the record holds a quantity and unit, else null. */
  amount: string | null;
  assumptions: string[];
  verificationNeeded: string[];
}

export interface PackageResponse {
  id: string;
  title: string;
  description: string;
  status: Intervention["status"];
  assumptions: string[];
  checkFirst: string[];
  livelihood: string[];
  ecology: string[];
  reviewRoles: Role[];
  chips: number[];
}

export interface PackageReview {
  role: Role;
  status: ReviewDecision["status"];
  authorityEstablished: boolean;
}

export interface PackageView {
  briefId: string;
  briefRevision: number;
  actionId: string | null;
  title: string;
  status: Brief["status"];
  actionStatus: OperationalAction["status"] | null;
  mode: Brief["mode"];
  /** The case revision the package was prepared on, and the case's revision now. */
  preparedOn: number;
  caseRevision: number;
  objective: string | null;
  decisionInformed: string | null;
  known: PackageLine[];
  uncertain: PackageLine[];
  measureNext: PackageLine[];
  involve: PackageLine[];
  prepared: PackageLine[];
  authorization: PackageLine[];
  nextSteps: PackageLine[];
  measures: PackageMeasure[];
  /** Gaps the plan leaves for later: the gap as its record states it (null when the case no longer holds it). */
  deferred: { gap: string | null; reason: string }[];
  /** Permissions and consultation steps the plan names before any field work. */
  beforeFieldWork: string[];
  remainingConditions: string[];
  resources: PackageResource[];
  responses: PackageResponse[];
  reviews: PackageReview[];
  limitations: string[];
  sources: PackageSource[];
}

/**
 * A recorded text as shown: a Source id ("src_SCI-19") or a Source's bare code ("SCI-19", the id without its prefix)
 * reads as that Source's short citation, so no internal code reaches the screen. Codes the case holds no Source for
 * are left as written. The record keeps its own text.
 */
export function readableText(snapshot: CaseSnapshot, text: string): string {
  const sources = snapshot.records.sourceRecords;
  return readableStatement(snapshot, text).replace(/\b[A-Z]{2,}-[0-9]+[a-z]?\b/g, (code) => {
    const src = sources.find((x) => x.id === `src_${code}`);
    return src ? shortCitation(src) : code;
  });
}

/** The latest revision of each record id. */
function latest<T extends { id: string; revision: number }>(rows: readonly T[]): T[] {
  const by = new Map<string, T>();
  for (const r of rows) {
    const had = by.get(r.id);
    if (!had || had.revision < r.revision) by.set(r.id, r);
  }
  return [...by.values()];
}

/** The Brief a question's tasks committed, the latest when it holds more than one; else undefined. */
export function commandBrief(snapshot: CaseSnapshot, commandId: string): Brief | undefined {
  const tasks = new Set(
    snapshot.records.taskRecords.filter((t) => t.commandId === commandId).map((t) => t.id),
  );
  return latest(snapshot.records.briefRecords)
    .filter((b) => tasks.has(b.provenance.generatedByTaskId ?? ""))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .at(-1);
}

/** Numbers sources in the order the package first cites them. */
class Chips {
  readonly sources: PackageSource[] = [];
  private readonly snapshot: CaseSnapshot;
  private readonly evidence: ReadonlyMap<string, Evidence>;
  constructor(snapshot: CaseSnapshot, evidence: ReadonlyMap<string, Evidence>) {
    this.snapshot = snapshot;
    this.evidence = evidence;
  }
  private short(key: string): string {
    const r = this.snapshot.records;
    const src = r.sourceRecords.find((x) => x.id === key);
    if (src) return shortCitation(src);
    const bundle = r.dataBundleRecords.find((x) => x.id === key);
    return bundle?.label ?? "";
  }
  of(evidenceIds: readonly string[]): number[] {
    const out = new Set<number>();
    for (const id of evidenceIds) {
      const e = this.evidence.get(id);
      if (!e) continue;
      const key = sourceKey(e);
      if (key === null) continue;
      let s = this.sources.find((x) => x.key === key);
      if (!s) {
        s = {
          n: this.sources.length + 1,
          key,
          short: this.short(key),
          note: sourceNote(this.snapshot, e),
        };
        this.sources.push(s);
      }
      out.add(s.n);
    }
    return [...out].sort((a, b) => a - b);
  }
}

const uniq = (v: readonly string[]) => [...new Set(v.map((s) => s.trim()).filter(Boolean))];

/** The package the Brief holds, with the records it names; undefined when the record holds no such Brief. */
export function packageView(snapshot: CaseSnapshot, briefId: string): PackageView | undefined {
  const r: Records = snapshot.records;
  const brief = latest(r.briefRecords).find((b) => b.id === briefId);
  if (!brief) return undefined;
  const evidence = new Map(latest(r.evidenceRecords).map((e) => [e.id, e]));
  const chips = new Chips(snapshot, evidence);
  const read = (t: string) => readableText(snapshot, t);
  const lines = (items: readonly BriefItem[]): PackageLine[] =>
    items.map((i) => ({
      text: read(i.text),
      claimKind: i.claimKind,
      chips: chips.of(i.evidenceIds),
    }));

  // the brief's sections first, so its chips are numbered in reading order
  const known = lines(brief.known);
  const uncertain = lines(brief.uncertain);
  const measureNext = lines(brief.nextMeasurements);

  const actions = latest(r.operationalActionRecords);
  const action = brief.actionIds
    .map((id) => actions.find((a) => a.id === id))
    .find((a): a is OperationalAction => a !== undefined);
  const plan = action?.fieldPlan;
  const bundles = new Set(r.dataBundleRecords.map((b) => b.id));
  const checks = new Map(
    (r.branchMergeRecords ?? []).flatMap((m) =>
      (m.fieldPlan?.measurements ?? []).map((c) => [c.fieldCheckId, c.label] as const),
    ),
  );
  const places = new Map(
    (plan?.strata ?? []).map((s) => [
      s.key,
      {
        key: s.key,
        label: s.label,
        definition: s.definition,
        bundleId: s.dataBundleId !== null && bundles.has(s.dataBundleId) ? s.dataBundleId : null,
      },
    ]),
  );
  const statement = (id: string) => {
    const e = evidence.get(id);
    return e ? read(e.statement) : null;
  };
  const measures: PackageMeasure[] = (plan?.measurements ?? []).map((m) => {
    const checkLabel = m.fieldCheckId ? checks.get(m.fieldCheckId) : undefined;
    return {
      what: m.what,
      method: m.method,
      season: m.season,
      fieldRole: m.fieldRole,
      places: m.stratumKeys.flatMap((k) => {
        const p = places.get(k);
        return p ? [p] : [];
      }),
      fieldCheck:
        m.fieldCheckId && checkLabel !== undefined
          ? { id: m.fieldCheckId, label: checkLabel }
          : null,
      answers: m.resolvesGapIds.flatMap((id) => statement(id) ?? []),
      chips: chips.of(m.resolvesGapIds),
    };
  });

  const interventions = latest(r.interventionRecords);
  const responses: PackageResponse[] = brief.interventionIds.flatMap((id) => {
    const i = interventions.find((x) => x.id === id);
    if (!i) return [];
    return [
      {
        id: i.id,
        title: i.title,
        description: read(i.description),
        status: i.status,
        assumptions: i.assumptions.map(read),
        checkFirst: i.fieldValidationNeeded.map(read),
        livelihood: i.livelihoodConsiderations.map(read),
        ecology: i.ecologicalConsiderations.map(read),
        reviewRoles: i.requiredReviewRoles,
        chips: chips.of(i.evidenceIds),
      },
    ];
  });

  const resourcesById = new Map(latest(r.resourceRequirementRecords).map((x) => [x.id, x]));
  const resources: PackageResource[] = (action?.resourceRequirementIds ?? []).flatMap((id) => {
    const x = resourcesById.get(id);
    if (!x) return [];
    return [
      {
        id: x.id,
        label: x.label,
        kind: x.resourceKind,
        estimate: x.estimateStatus,
        amount: x.quantity !== null && x.unit !== null ? `${String(x.quantity)} ${x.unit}` : null,
        assumptions: x.assumptions,
        verificationNeeded: x.verificationNeeded,
      },
    ];
  });

  const reviewsById = new Map(latest(r.reviewDecisionRecords).map((x) => [x.id, x]));
  const reviews: PackageReview[] = brief.reviewDecisionIds.flatMap((id) => {
    const x = reviewsById.get(id);
    return x
      ? [
          {
            role: x.role,
            status: x.status,
            authorityEstablished: x.authorityStatus === "verified_for_scope",
          },
        ]
      : [];
  });

  return {
    briefId: brief.id,
    briefRevision: brief.revision,
    actionId: action?.id ?? null,
    title: brief.title,
    status: brief.status,
    actionStatus: action?.status ?? null,
    mode: brief.mode,
    preparedOn: brief.sourceCaseRevision,
    caseRevision: snapshot.case.revision,
    objective: plan?.objective ?? null,
    decisionInformed: plan?.decisionInformed ?? null,
    known,
    uncertain,
    measureNext,
    measures,
    responses,
    involve: lines(brief.stakeholderRoles),
    prepared: lines(brief.preparedActions),
    authorization: lines(brief.authorizationRequired),
    nextSteps: lines(brief.nextSteps),
    deferred: (plan?.deferredGaps ?? []).map((g) => ({
      gap: statement(g.gapId),
      reason: read(g.reason),
    })),
    beforeFieldWork: uniq([...(plan?.permissions ?? []), ...(plan?.consultationSteps ?? [])]),
    remainingConditions: uniq(action?.remainingConditions ?? []),
    resources,
    reviews,
    limitations: uniq([...brief.limitations, ...brief.provenance.limitations]),
    sources: chips.sources,
  };
}

/** The kinds of place a package ties to the land, once each, for the scene to light on hover. */
export function placesOnLand(view: PackageView): PackagePlace[] {
  const seen = new Map<string, PackagePlace>();
  for (const m of view.measures)
    for (const p of m.places) if (p.bundleId !== null && !seen.has(p.key)) seen.set(p.key, p);
  return [...seen.values()];
}
