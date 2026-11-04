// The next-steps package of one question, read from the case record (UI-2 unit 1): the Brief that the question's
// brief task committed, its OperationalAction with the field plan, the ResourceRequirements the action names, the
// candidate responses (Intervention) the brief rests on and the review requests (ReviewDecision). Pure: every line
// here is a record field; nothing is inferred or ranked. Only the words change: a source id reads as its citation, a
// line the brief already states is shown once, under the first part that states it, and host code's fixed sentences
// read in catalog words (plainLine). Lines that cite evidence carry numbered source chips by the results' rule
// (source record, else data bundle, else measurement). A kind of place is tied to the land only where its record
// names a data bundle of the case (FieldStratum.dataBundleId) and, for a field check, where a measurement names the
// merge's fieldCheckId.

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
import { pformat, pkg, type PackageMessageId } from "../copy/package";
import { readableStatement, shortCitation, sourceKey } from "../overview/results";
import { HOST_TEXT } from "./host-text";

type Records = CaseSnapshot["records"];
export type ClaimKind = BriefItem["claimKind"];
export type Role = ReviewDecision["role"];

/** One numbered source a package line cites, as the brief lists it. */
export interface PackageSource {
  n: number;
  /** What the chip numbers: a source id, a data bundle id or a measurement id. */
  key: string;
  /** The study's title, or the data's name. */
  title: string;
  /** The study's own link (its DOI or page); null for the case's data. */
  href: string | null;
  /** What follows the title: the authors and year, the venue and the pages cited; for data, its credit. */
  detail: string[];
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
  /** The action's conditions no earlier part states. */
  remainingConditions: string[];
  resources: PackageResource[];
  responses: PackageResponse[];
  reviews: PackageReview[];
  /** The brief's own limits no earlier part states, host sentences in catalog words. */
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

/**
 * Where in a source a locator points, without the file it was read from: "ES-2011-4429.pdf, page 2" reads "page 2".
 * The file is the case's private copy, not something a reader can open; the link is the study's own.
 */
export function locusOf(locator: string): string {
  return locator
    .split(/,\s*/)
    .map((part) =>
      part
        .replace(/\bhttps?:\/\/\S+/gi, "")
        .replace(/\S+\.(?:pdf|html?|xml|docx?|xlsx?|csv|json|txt|zip|tiff?)\b/gi, "")
        .trim(),
    )
    .filter((part) => part !== "")
    .join(", ");
}

/** A study's cited places in order: several pages read as one ("pages 5, 7, 8"), any other kind as recorded. */
export function lociWords(loci: readonly string[]): string[] {
  const pages = loci.map((l) => /^(?:page|p\.)\s*(\S+)$/i.exec(l)?.[1]);
  const numbers = pages.filter((p) => p !== undefined);
  return loci.length > 1 && numbers.length === loci.length
    ? [pformat("package.source.pages", { pages: numbers.join(", ") })]
    : [...loci];
}

/** Numbers sources in the order the package first cites them, each with the places its lines cite. */
class Chips {
  private readonly entries: PackageSource[] = [];
  private readonly loci = new Map<string, string[]>();
  private readonly snapshot: CaseSnapshot;
  private readonly evidence: ReadonlyMap<string, Evidence>;
  constructor(snapshot: CaseSnapshot, evidence: ReadonlyMap<string, Evidence>) {
    this.snapshot = snapshot;
    this.evidence = evidence;
  }
  /** The numbered sources, a study's cited places last. */
  get sources(): PackageSource[] {
    return this.entries.map((s) => ({
      ...s,
      detail: [...s.detail, ...lociWords(this.loci.get(s.key) ?? [])],
    }));
  }
  /** A source by its key: a study with its link, else the data its bundle (or measurement's bundle) names. */
  private entry(key: string, n: number): PackageSource {
    const r = this.snapshot.records;
    const src = r.sourceRecords.find((x) => x.id === key);
    if (src)
      return {
        n,
        key,
        title: src.title,
        href: src.url,
        detail: [shortCitation(src), ...(src.publisher ? [src.publisher] : [])],
      };
    const bundleId = r.measurementRecords.find((m) => m.id === key)?.dataBundleId ?? key;
    const bundle = r.dataBundleRecords.find((b) => b.id === bundleId);
    return {
      n,
      key,
      title: bundle?.label ?? pkg["package.source.missing"].text,
      href: null,
      detail: bundle?.attribution ? [bundle.attribution] : [],
    };
  }
  of(evidenceIds: readonly string[]): number[] {
    const out = new Set<number>();
    for (const id of evidenceIds) {
      const e = this.evidence.get(id);
      if (!e) continue;
      const key = sourceKey(e);
      if (key === null) continue;
      let s = this.entries.find((x) => x.key === key);
      if (!s) {
        s = this.entry(key, this.entries.length + 1);
        this.entries.push(s);
      }
      // a study's places, each once, in the order the brief cites them
      if (s.href !== null) {
        const loci = this.loci.get(key) ?? [];
        for (const loc of e.provenance.sourceLocators) {
          const locus = loc.sourceId === key ? locusOf(loc.locator) : "";
          if (locus !== "" && !loci.includes(locus)) loci.push(locus);
        }
        this.loci.set(key, loci);
      }
      out.add(s.n);
    }
    return [...out].sort((a, b) => a - b);
  }
}

/** A line as the brief compares it with the lines before it: trimmed, spaces folded, no closing stop, any case. */
const sameAs = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.;:,]+$/, "")
    .toLowerCase();

/** Each line once, under the first part of the brief that states it, in the brief's reading order. */
class Once {
  private readonly seen = new Set<string>();
  keep<T>(items: readonly T[], text: (item: T) => string): T[] {
    return items.filter((item) => {
      const k = sameAs(text(item));
      if (k === "" || this.seen.has(k)) return false;
      this.seen.add(k);
      return true;
    });
  }
}

// host code's fixed sentences (lib/package/host-text.ts) by their catalog words; null where the brief already says it
const HOST_LINES: ReadonlyMap<string, PackageMessageId | null> = new Map<
  string,
  PackageMessageId | null
>([
  [HOST_TEXT.briefDraft, null],
  [HOST_TEXT.noAuthority, "package.host.noAuthority"],
  [HOST_TEXT.synthetic, "package.host.synthetic"],
  [HOST_TEXT.replaySynthetic, "package.host.replaySynthetic"],
  [HOST_TEXT.replayRecorded, "package.host.replayRecorded"],
]);

/**
 * A record sentence as the brief shows it: host code's fixed sentences in catalog words, any other as recorded. The
 * draft line is null: the brief's head says nothing has been sent, scheduled or authorized, and "Siterra Prepared"
 * says what Siterra drafted. The no-authority line keeps its first clause, whose second the head says.
 */
export function plainLine(text: string): string | null {
  const id = HOST_LINES.get(text.trim());
  if (id === undefined) return text;
  return id === null ? null : pkg[id].text;
}

const uniq = (v: readonly string[]) => [...new Set(v.map((s) => s.trim()).filter(Boolean))];

/**
 * Whether a measurement's link to the merge's field check is shown. Shown since PLATFORM's fit rule (P9d) is merged:
 * the record keeps a measurement's fieldCheckId only where the explanations it tells apart meet the pairs the check
 * separates, so a link in the record means they share at least one question (the lead, 20:58). The exported brief
 * prints no check name: the answer's Next rows name each check by its measurement's own "what", as the brief's table
 * does (fix-1103); the step cards leave it out for good (text budget).
 */
export const FIELD_CHECK_LINKS_SHOWN = true;

/** The package the Brief holds, with the records it names; undefined when the record holds no such Brief. */
export function packageView(
  snapshot: CaseSnapshot,
  briefId: string,
  { fieldCheckLinks = FIELD_CHECK_LINKS_SHOWN }: { fieldCheckLinks?: boolean } = {},
): PackageView | undefined {
  const r: Records = snapshot.records;
  const brief = latest(r.briefRecords).find((b) => b.id === briefId);
  if (!brief) return undefined;
  const evidence = new Map(latest(r.evidenceRecords).map((e) => [e.id, e]));
  const chips = new Chips(snapshot, evidence);
  const once = new Once();
  const read = (t: string) => readableText(snapshot, t);
  // a part's lines that no earlier part states, their chips numbered as they are read
  const lines = (items: readonly BriefItem[]): PackageLine[] =>
    once
      .keep(
        items.map((i) => ({ item: i, text: read(i.text) })),
        (x) => x.text,
      )
      .map(({ item, text }) => ({
        text,
        claimKind: item.claimKind,
        chips: chips.of(item.evidenceIds),
      }));
  // a list of record sentences no earlier part states, host sentences in catalog words
  const plain = (texts: readonly string[]): string[] =>
    once.keep(
      uniq(texts).flatMap((t) => {
        const p = plainLine(t);
        return p === null ? [] : [p === t ? read(t) : p];
      }),
      (t) => t,
    );

  // in the brief's reading order (components/package/PackageBrief.tsx), so chips are numbered as they are read
  const known = lines(brief.known);
  const uncertain = lines(brief.uncertain);

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
        fieldCheckLinks && m.fieldCheckId && checkLabel !== undefined
          ? { id: m.fieldCheckId, label: checkLabel }
          : null,
      chips: chips.of(m.resolvesGapIds),
    };
  });
  // the brief's own measurement lines stand in for the plan's table only where the plan holds no measurement
  const measureNext = measures.length === 0 ? lines(brief.nextMeasurements) : [];
  const deferred = (plan?.deferredGaps ?? []).map((g) => ({
    gap: statement(g.gapId),
    reason: read(g.reason),
  }));
  const beforeFieldWork = plain([...(plan?.permissions ?? []), ...(plan?.consultationSteps ?? [])]);

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

  const prepared = lines(brief.preparedActions);
  const authorization = lines(brief.authorizationRequired);
  const involve = lines(brief.stakeholderRoles);
  const nextSteps = lines(brief.nextSteps);
  const remainingConditions = plain(action?.remainingConditions ?? []);
  const limitations = plain([...brief.limitations, ...brief.provenance.limitations]);

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
    involve,
    prepared,
    authorization,
    nextSteps,
    deferred,
    beforeFieldWork,
    remainingConditions,
    resources,
    reviews,
    limitations,
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

export { packageViewForCase } from "./package-fallback";
