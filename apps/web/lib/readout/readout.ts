// The answer readout: what the overview's answer column shows once a run has finished, built only from one case
// record (the run's own after a replay). The answer says in one sentence how much of the area the long record measured
// greening and browning since the first year of its own record, else which explanations the merge finds fit the
// evidence; the verdicts hold every explanation the answer does not name, each with the merge's status, out of date
// once its branch moved past the revision the merge scored (CMP-23); the checks to make next are the field plan of the
// action the merge's plan binds (else the merge's own), each with the pairs of explanations only it tells apart; the
// reviews are the ones requested of that plan; a question typed in the Ask heads them with the case's findings its task
// chose (lib/ask/findings.ts). Nothing here ranks, rewords a host's text or places an explanation on the land: no branch
// record carries a place.

import type { CaseSnapshot } from "@siterra/contracts";
import { chosenFindings, type ChosenFinding } from "../ask/findings";
import { leadSourcesOf, type LeadSources } from "../ask/leads";
import { isAskTaskId } from "../ask/task";
import { rd, rformat, type ReadoutMessageId } from "../copy/readout";
import { percent } from "../instruments/format";
import { bandLimitsOf } from "../land/record";
import { periodOf } from "../land/season";
import type { Finding } from "../overview/findings";
import { rangeOfKey } from "../package/bands";
import { STATUS_ANSWERS, capital, inline, joinLabels } from "./words";

export {
  datedText,
  joinLabels,
  nextWords,
  periodIdWords,
  seasonIdWords,
  sentenceCase,
  verdictWords,
} from "./words";

type Records = CaseSnapshot["records"];
type Merge = NonNullable<Records["branchMergeRecords"]>[number];
type Action = Records["operationalActionRecords"][number];
type Measurement = Records["measurementRecords"][number];
export type BranchStatus = Merge["branches"][number]["status"];

export interface ReadoutAnswer {
  /**
   * The answer in one sentence: the shares the long record measured since its first year, else the explanations that
   * fit the evidence (or, with none, those that do not), else that no explanation has been tested.
   */
  claim: string | null;
  claimKind: "measurement" | "status" | null;
  /** The measurement or explanation ids the claim reads. */
  claimIds: readonly string[];
  /** The first year of the measured shares' own record ("2000"); null for any other claim. */
  from: string | null;
}

export interface ExplanationRow {
  explanationId: string;
  branchId: string;
  label: string;
  status: BranchStatus;
  /** True when the branch's record is at another revision than the one the merge scored (CMP-23). */
  stale: boolean;
}

export interface Explanations {
  /** One row per explanation, in the merge's order. */
  rows: readonly ExplanationRow[];
}

/** The explanations with one verdict, in the merge's order. */
export interface Verdict {
  status: BranchStatus;
  rows: readonly ExplanationRow[];
}

export interface GroundCheck {
  number: string;
  fieldCheckId: string | null;
  /** The check's own description, as its plan writes it. */
  what: string;
  /** The plan's labels for the strata the check names. */
  place: string | null;
  /** True when every stratum the check names has a height range (stratumRange), so the land can light it. */
  drawn: boolean;
  stratumKeys: readonly string[];
  /**
   * The pairs of explanations only this check tells apart (the merge's field plan), as labels inside a sentence,
   * each pair in the merge's order.
   */
  separates: readonly { a: string; b: string }[];
  /** The gaps, then the explanations, the check's plan says it settles (their record ids); none without a plan. */
  rests: readonly string[];
}

export interface Ground {
  checks: readonly GroundCheck[];
  /** The reviews requested of the bound plan; none without it. */
  reviews: readonly { id: string; role: string; mode: string }[];
}

/** A finding a follow-up's task chose: its record's id, and its lines once read (a view's lead is read apart). */
export interface FollowUpFinding extends ChosenFinding {
  id: string;
}

export interface FollowUp {
  commandId: string;
  /** The question as the follow-up's task holds it; null until the record holds the task. */
  question: string | null;
  /**
   * True once the record holds the question's outcome: its own task's choice (none, possibly), or, for a command whose
   * other tasks answered it, those tasks. Until then, and for a task that failed, nothing is said but the question.
   */
  answered: boolean;
  /** The case's findings the question's task chose, in its order (it chooses three at most). */
  findings: readonly FollowUpFinding[];
  /** What a chosen view's lead is read from (lib/ask/leads.ts). */
  leads: LeadSources;
}

export interface Readout {
  answer: ReadoutAnswer;
  /** Every explanation the merge scored, in its order. */
  explanations: Explanations | null;
  /** The explanations under their verdicts, leaving out the ones the answer already names. */
  verdicts: readonly Verdict[];
  ground: Ground | null;
  /** The merge the verdicts come from; null without one. */
  mergeId: string | null;
  /** A question typed in the Ask, when opts.commandId names its command: the case's findings its task chose. */
  request: FollowUp | null;
}

/** An explanation id in words, for a branch the record does not hold: "snow_terrain" as "Snow terrain". */
const idLabel = (id: string) => capital(id.replace(/_/g, " "));

/** The one merge the readout binds: the latest by its record's time. */
export function latestMerge(snapshot: CaseSnapshot): Merge | null {
  const merges = [...(snapshot.records.branchMergeRecords ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return merges[merges.length - 1] ?? null;
}

function explanationsOf(snapshot: CaseSnapshot, merge: Merge): Explanations {
  const branches = new Map((snapshot.records.explanationBranchRecords ?? []).map((b) => [b.id, b]));
  return {
    rows: merge.branches.map((entry) => {
      const branch = branches.get(entry.branchId);
      return {
        explanationId: entry.explanationId,
        branchId: entry.branchId,
        label: branch?.label ?? idLabel(entry.explanationId),
        status: entry.status,
        // the merge scored the revision it names; a record at another one changed after it. A branch the record does
        // not hold has no revision to compare
        stale: branch !== undefined && branch.revision !== entry.branchRevision,
      };
    }),
  };
}

/** The verdicts in the column's order: what fits, what lacks data, what does not fit. */
const VERDICT_ORDER: readonly BranchStatus[] = ["consistent", "cannot_be_assessed", "contradicted"];

/**
 * The explanations under their verdicts, in the column's order, each said once: an answer made of verdicts already
 * names its explanations, so they are left out here; a verdict no explanation is left with is left out too.
 */
function verdictsOf(ex: Explanations | null, answer: ReadoutAnswer): Verdict[] {
  const named = new Set(answer.claimKind === "status" ? answer.claimIds : []);
  const rows = (ex?.rows ?? []).filter((r) => !named.has(r.explanationId));
  return VERDICT_ORDER.map((status) => ({
    status,
    rows: rows.filter((r) => r.status === status),
  })).filter((v) => v.rows.length > 0);
}

const measurementOf = (snapshot: CaseSnapshot, id: string): Measurement | undefined =>
  snapshot.records.measurementRecords.find((m) => m.id === id);

const stratumOf = (m: Measurement) => m.source?.stratum ?? null;

/** The years and window a measurement covers, as its record states them (its source period, else its period id). */
function spanOf(m: Measurement): { start: string; end: string; window: string | null } | null {
  const period = m.source?.period;
  if (period) return { start: period.start, end: period.end, window: period.window };
  const byId = periodOf(m.periodId);
  return byId ? { start: String(byId.from), end: String(byId.to), window: byId.window } : null;
}

/** The first year a measurement's record covers ("2000" of "2000 to 2025"); null when it states none. */
const firstYear = (m: Measurement): string | null =>
  /^\d{4}/.exec(spanOf(m)?.start ?? "")?.[0] ?? null;

/** True when two measurements' records cover the same years and window. */
function sameSpan(a: Measurement, b: Measurement): boolean {
  const x = spanOf(a);
  const y = spanOf(b);
  return (
    x !== null && y !== null && x.start === y.start && x.end === y.end && x.window === y.window
  );
}

/**
 * The other direction's share for the same cells, period and bundle, when the record holds it: the answer cites
 * both, so a greening share is never read without its browning share.
 */
function otherShare(
  snapshot: CaseSnapshot,
  f: Finding,
  m: Measurement | undefined,
): { m: Measurement; display: string } | null {
  if (f.pair) {
    const pair = measurementOf(snapshot, f.pair.measurementId);
    return pair ? { m: pair, display: f.pair.display } : null;
  }
  const metric = f.direction === "up" ? "area_share_downward_fdr" : "area_share_upward_fdr";
  const other = m
    ? snapshot.records.measurementRecords.find(
        (x) =>
          x.metric === metric &&
          x.status === "available" &&
          x.value !== null &&
          x.periodId === m.periodId &&
          x.dataBundleId === m.dataBundleId &&
          x.geoSelectionId === m.geoSelectionId &&
          stratumOf(x) === stratumOf(m),
      )
    : undefined;
  return other?.value != null ? { m: other, display: percent(other.value, 1) } : null;
}

/**
 * The answer in one sentence: the long record's measured shares since the first year of their own record, else the
 * explanations the merge finds fit the evidence, else the ones it finds do not, else the ones it could not assess,
 * else that none has been tested.
 */
function answerOf(
  snapshot: CaseSnapshot,
  findings: readonly Finding[],
  ex: Explanations | null,
): ReadoutAnswer {
  let claim: string | null = null;
  let claimKind: ReadoutAnswer["claimKind"] = null;
  let claimIds: string[] = [];
  let from: string | null = null;
  const shares = findings.find((f) => f.id === "fdr" && !f.missingReason && f.direction !== null);
  const m = shares ? measurementOf(snapshot, shares.measurementId) : undefined;
  const first = m ? firstYear(m) : null;
  // the shares are said only with the year they start from: without one, "has greened" would have no since
  if (shares && m && first) {
    const kind = m.source?.claimKind ?? null;
    // the other direction joins the one sentence only when its record covers the same years with the same claim kind
    const found = otherShare(snapshot, shares, m);
    const other =
      found && sameSpan(found.m, m) && (found.m.source?.claimKind ?? null) === kind ? found : null;
    const up = shares.direction === "up" ? shares.display : other?.display;
    const down = shares.direction === "down" ? shares.display : other?.display;
    // both shares exactly zero: no cell holds a trend either way, said in words rather than as two zeros
    const none = other !== null && shares.value === 0 && other.m.value === 0;
    claim = none
      ? rformat("readout.answer.sharesNone", { from: first })
      : up && down
        ? rformat("readout.answer.shares", { from: first, up, down })
        : up
          ? rformat("readout.answer.shareUp", { from: first, up })
          : down
            ? rformat("readout.answer.shareDown", { from: first, down })
            : null;
    if (claim) {
      claimKind = "measurement";
      claimIds = [shares.measurementId, ...(other ? [other.m.id] : [])];
      from = first;
    }
  }
  const rows = ex?.rows ?? [];
  // nothing measured: the explanations that fit the evidence, else the ones that do not, else the ones that lack data
  for (const s of STATUS_ANSWERS) {
    const named = rows.filter((r) => r.status === s.status);
    if (claim || !named.length) continue;
    claim = rformat(named.length === 1 ? s.one : s.many, {
      labels: joinLabels(
        named.map((r) => r.label),
        s.labelsFirst,
      ),
    });
    claimKind = "status";
    claimIds = named.map((r) => r.explanationId);
  }
  // nothing measured and no explanation that fits or does not: none has been tested
  if (!claim && !rows.length) claim = rd["readout.answer.none"].text;
  return { claim, claimKind, claimIds, from };
}

/** The open ends of the lowest and highest elevation bands on the land (m). */
const LAND_FLOOR_M = -1000;
const LAND_TOP_M = 9000;

/**
 * The heights a field plan stratum covers on the land: an elevation band (elevation_low, elevation_mid,
 * elevation_high) between the record's two band limits (bandLimitsOf), the lowest and the highest open to the land's
 * floor and top; null for any other stratum (a kind of place, an aspect, the catchment) or without the limits. A
 * check is drawn, and its place lit, with these ranges only.
 */
export function stratumRange(
  key: string,
  limits: readonly [number, number] | null,
): { lo: number; hi: number } | null {
  const range = rangeOfKey(key, limits);
  return range ? { lo: range.lo ?? LAND_FLOOR_M, hi: range.hi ?? LAND_TOP_M } : null;
}

/**
 * The action whose field plan the bound merge's plan covers: every field check it names is one the merge proposes
 * (the brief task writes no other), the latest such; none when the merge proposes no check.
 */
function fieldActionOf(snapshot: CaseSnapshot, merge: Merge | null): Action | null {
  const proposed = new Set((merge?.fieldPlan?.measurements ?? []).map((m) => m.fieldCheckId));
  const bound = snapshot.records.operationalActionRecords.filter((a) => {
    const ids = (a.fieldPlan?.measurements ?? []).flatMap((m) =>
      m.fieldCheckId ? [m.fieldCheckId] : [],
    );
    return ids.length > 0 && ids.every((id) => proposed.has(id));
  });
  return [...bound].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) ?? null;
}

/** The pairs of explanations only the merge's check tells apart, labelled, each pair in the merge's order. */
function separatesOf(
  merge: Merge | null,
  fieldCheckId: string | null,
  rows: readonly ExplanationRow[],
): GroundCheck["separates"] {
  const check = merge?.fieldPlan?.measurements.find((m) => m.fieldCheckId === fieldCheckId);
  if (!fieldCheckId || !check) return [];
  const at = (id: string) => {
    const i = rows.findIndex((r) => r.explanationId === id);
    return i < 0 ? rows.length : i;
  };
  const label = (id: string) =>
    inline(rows.find((r) => r.explanationId === id)?.label ?? idLabel(id));
  return check.onlySeparates.map(([x, y]) =>
    at(y) < at(x) ? { a: label(y), b: label(x) } : { a: label(x), b: label(y) },
  );
}

function groundOf(
  snapshot: CaseSnapshot,
  merge: Merge | null,
  rows: readonly ExplanationRow[],
  limits: readonly [number, number] | null,
): Ground | null {
  const action = fieldActionOf(snapshot, merge);
  const plan = action?.fieldPlan;
  const number = (i: number) => String(i + 1).padStart(2, "0");
  const checks: GroundCheck[] = plan
    ? plan.measurements.map((m, i) => {
        const places = m.stratumKeys.flatMap((k) => {
          const stratum = plan.strata.find((s) => s.key === k);
          return stratum ? [stratum.label] : [];
        });
        const fieldCheckId = m.fieldCheckId ?? null;
        return {
          number: number(i),
          fieldCheckId,
          what: m.what,
          place: places.length ? joinLabels(places) : null,
          drawn:
            m.stratumKeys.length > 0 &&
            m.stratumKeys.every((k) => stratumRange(k, limits) !== null),
          stratumKeys: m.stratumKeys,
          separates: separatesOf(merge, fieldCheckId, rows),
          rests: [...m.resolvesGapIds, ...m.discriminatesHypothesisIds],
        };
      })
    : (merge?.fieldPlan?.measurements ?? []).map((m, i) => ({
        number: number(i),
        fieldCheckId: m.fieldCheckId,
        what: m.label,
        place: null,
        drawn: false,
        stratumKeys: [],
        separates: separatesOf(merge, m.fieldCheckId, rows),
        rests: [],
      }));
  // the reviews are the bound plan's own: the ones requested of it
  const reviews = action
    ? snapshot.records.reviewDecisionRecords
        .filter(
          (r) =>
            r.status === "requested" &&
            !r.stale &&
            (r.actionId === action.id || action.reviewDecisionIds.includes(r.id)),
        )
        .map((r) => ({ id: r.id, role: r.role, mode: r.mode }))
    : [];
  if (!checks.length && !reviews.length) return null;
  return { checks, reviews };
}

/**
 * A question typed in the Ask: the case's findings its task chose (lib/ask/findings.ts chosenFindings), from the
 * records the task names (Task.inputVersions), each worded again from the record as the column words it. The model's
 * own words are kept nowhere, so none can be shown.
 */
function requestOf(
  snapshot: CaseSnapshot,
  commandId: string,
  column: Parameters<typeof chosenFindings>[1],
): FollowUp {
  const tasks = snapshot.records.taskRecords
    .filter((t) => t.commandId === commandId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ask = tasks.filter((t) => isAskTaskId(t.id)).at(-1);
  const chose = ask?.status === "succeeded" ? ask.inputVersions : [];
  return {
    commandId,
    question: ask?.question ?? null,
    answered: ask ? ask.status === "succeeded" : tasks.length > 0,
    findings: chosenFindings(snapshot, column, chose).map((f) => ({ ...f, id: f.key.entityId })),
    leads: leadSourcesOf(snapshot),
  };
}

/**
 * The readout of one case record, with the arc's findings computed from that same record. `limits` are the two
 * elevation band limits the land is drawn with, which decide which checks it can light (the record's own,
 * bandLimitsOf, when left out; null for none); `commandId` names a question typed in the Ask, whose chosen findings
 * it lists.
 * The band limit's words are no longer read; the parameter stays for the callers.
 */
export function readoutOf(
  snapshot: CaseSnapshot,
  findings: readonly Finding[],
  _bandLimit: string,
  opts: { commandId?: string | null; limits?: readonly [number, number] | null } = {},
): Readout {
  const merge = latestMerge(snapshot);
  const explanations = merge ? explanationsOf(snapshot, merge) : null;
  const limits = opts.limits === undefined ? bandLimitsOf(snapshot) : opts.limits;
  const answer = answerOf(snapshot, findings, explanations);
  const verdicts = verdictsOf(explanations, answer);
  const ground = groundOf(snapshot, merge, explanations?.rows ?? [], limits);
  const mergeId = merge?.id ?? null;
  return {
    answer,
    explanations,
    verdicts,
    ground,
    mergeId,
    request: opts.commandId
      ? requestOf(snapshot, opts.commandId, {
          answer,
          verdicts,
          checks: ground?.checks ?? [],
          mergeId,
        })
      : null,
  };
}

/** A follow-up's finding as one text: its lines as its view or the column words them, one after another. */
export function findingWords(f: Pick<FollowUpFinding, "lines">): string {
  return (f.lines ?? []).join(" ");
}

/** A follow-up with this many findings or fewer shows them whole; a longer one shows its first ones and a row. */
const WHOLE_FINDINGS = 3;
/** How many of a longer follow-up's findings show before that row: two full ones keep the verdicts, the next checks
 *  and the views in sight at 1440 by 900 (three made about twelve lines and pushed the views under the fade). */
const FIRST_FINDINGS = 2;

/**
 * A follow-up's findings as the column shows them, so they never push the rest of the column out of sight: three or
 * fewer whole, with no row (a row never hides a single finding); more than three, the first two in the order its task
 * chose them with one row that shows all of them, and once that row is pressed every finding with a row that shows
 * fewer.
 */
export function followUpOf<T>(
  findings: readonly T[],
  all: boolean,
): { shown: readonly T[]; toggle: string | null } {
  if (findings.length <= WHOLE_FINDINGS) return { shown: findings, toggle: null };
  return all
    ? { shown: findings, toggle: rd["readout.request.fewer"].text }
    : {
        shown: findings.slice(0, FIRST_FINDINGS),
        toggle: rformat("readout.request.all", { n: findings.length }),
      };
}

/** The requested reviews' roles in words: "Community and scientific review requested". */
export function reviewWords(reviews: Ground["reviews"]): string | null {
  if (!reviews.length) return null;
  const roles = [...new Set(reviews.map((r) => r.role))].map(
    (role) =>
      rd[
        (`readout.review.role.${role}` in rd
          ? `readout.review.role.${role}`
          : "readout.review.role.other") as ReadoutMessageId
      ].text,
  );
  return rformat("readout.review.requested", { roles: joinLabels(roles) });
}
