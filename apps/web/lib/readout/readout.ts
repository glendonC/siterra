// The answer readout: what the overview's answer column shows once a run has finished, built only from one case
// record (the run's own after a replay). The answer says in one sentence how much of the area the long record measured
// greening and browning since the first year of its own record, else which explanations the merge finds fit the
// evidence; the verdicts hold every explanation the answer does not name, each with the merge's status, out of date
// once its branch moved past the revision the merge scored (CMP-23); the checks to make next are the field plan of the
// action the merge's plan binds (else the merge's own), each with the pairs of explanations only it tells apart; the
// reviews are the ones requested of that plan. Nothing here ranks, rewords a host's text or places an explanation on
// the land: no branch record carries a place.

import type { CaseSnapshot } from "@siterra/contracts";
import { en, format, type MessageId } from "../copy/en";
import { rd, rformat, type ReadoutMessageId } from "../copy/readout";
import { percent } from "../instruments/format";
import { bandLimitsOf } from "../land/record";
import { periodOf } from "../land/season";
import type { Finding } from "../overview/findings";
import { readableStatement } from "../overview/results";
import { rangeOfKey } from "../package/bands";

type Records = CaseSnapshot["records"];
type Merge = NonNullable<Records["branchMergeRecords"]>[number];
type Action = Records["operationalActionRecords"][number];
type Measurement = Records["measurementRecords"][number];
export type BranchStatus = Merge["branches"][number]["status"];

/** A record's own claim kind (an Evidence's, a Measurement source's), as the contracts name the seven. */
export type ClaimKind =
  | "observation"
  | "scientific_context"
  | "hypothesis"
  | "model_estimate"
  | "scenario"
  | "field_requirement"
  | "verified_outcome";

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
}

export interface Ground {
  checks: readonly GroundCheck[];
  /** The reviews requested of the bound plan; none without it. */
  reviews: readonly { id: string; role: string; mode: string }[];
}

export interface RequestFinding {
  id: string;
  text: string;
  claimKind: ClaimKind;
}

export interface Readout {
  answer: ReadoutAnswer;
  /** Every explanation the merge scored, in its order. */
  explanations: Explanations | null;
  /** The explanations under their verdicts, leaving out the ones the answer already names. */
  verdicts: readonly Verdict[];
  ground: Ground | null;
  /** A follow-up request's own findings, when opts.commandId names a command: its Evidence (accepted or provisional), newest first. */
  request: { commandId: string; findings: readonly RequestFinding[] } | null;
}

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/** A month's number (1 to 12) as its name; null for any other number. */
const monthName = (m: number): string | null => {
  const key = MONTH_KEYS[m - 1];
  return key ? en[`month.${key}` as MessageId].text : null;
};

/** A "YYYY-MM" with a month from 01 to 12 as "April 2022"; null for any other text. */
function monthWords(ym: string): string | null {
  const [, year, month] = /^(\d{4})-(\d{2})$/.exec(ym) ?? [];
  const name = month === undefined ? null : monthName(Number(month));
  return year !== undefined && name ? `${name} ${year}` : null;
}

/** A season id ("season_2021-11_2022-04") in words: "November 2021 to April 2022"; null unless both are months. */
export function seasonIdWords(id: string): string | null {
  const [, start, end] = /^season_(\d{4}-\d{2})_(\d{4}-\d{2})$/.exec(id) ?? [];
  const from = start === undefined ? null : monthWords(start);
  const to = end === undefined ? null : monthWords(end);
  return from && to ? format("season.window", { from, to }) : null;
}

/** A monthly period id ("period_2022-04") in words ("April 2022"); any other id as written. */
export function periodIdWords(id: string): string {
  const month = /^period_(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(id)?.[1];
  return (month === undefined ? null : monthWords(month)) ?? id;
}

/** A host's text with its period and season ids shown as dates; every other word is left as written. */
export function datedText(text: string): string {
  return text
    .replace(/\bseason_\d{4}-\d{2}_\d{4}-\d{2}\b/g, (id) => seasonIdWords(id) ?? id)
    .replace(/\bperiod_\d{4}-\d{2}\b/g, (id) => periodIdWords(id));
}

/** A label inside a sentence: lower case first unless it reads as an acronym ("MODIS"). */
const inline = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;

/** Words that start a sentence: the first letter in capitals. */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** An explanation id in words, for a branch the record does not hold: "snow_terrain" as "Snow terrain". */
const idLabel = (id: string) => capital(id.replace(/_/g, " "));

/**
 * A plan's own description in sentence case: the first letter in capitals and every other word in lower case,
 * except a word in capitals or with a figure ("Local Rain Records" as "Local rain records", "MODIS" and "2019" kept).
 */
export function sentenceCase(text: string): string {
  return capital(
    text
      .split(" ")
      .map((word) =>
        /\d/.test(word) || /^[^a-z]*[A-Z][^a-z]*[A-Z][^a-z]*$/.test(word)
          ? word
          : word.toLowerCase(),
      )
      .join(" "),
  );
}

/** Words joined as a list, each as given: "a", "a and b", "a, b and c". */
function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  return rformat("readout.and", { first: words.slice(0, -1).join(", "), last });
}

/** Labels joined as words: "Grazing", "Grazing and land use", "Grazing, land use and snow or terrain". */
export function joinLabels(labels: readonly string[], sentenceStart = true): string {
  return joinWords(labels.map((l, i) => (i === 0 && sentenceStart ? capital(l) : inline(l))));
}

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

/** An answer made of verdicts, in the order one is chosen; the labels start the sentence except after "Not enough data". */
const STATUS_ANSWERS: readonly {
  status: BranchStatus;
  one: ReadoutMessageId;
  many: ReadoutMessageId;
  labelsFirst: boolean;
}[] = [
  {
    status: "consistent",
    one: "readout.answer.fits.one",
    many: "readout.answer.fits.many",
    labelsFirst: true,
  },
  {
    status: "contradicted",
    one: "readout.answer.doesNotFit.one",
    many: "readout.answer.doesNotFit.many",
    labelsFirst: true,
  },
  {
    status: "cannot_be_assessed",
    one: "readout.answer.open",
    many: "readout.answer.open",
    labelsFirst: false,
  },
];

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

/** A follow-up request's own findings: the Evidence its command's tasks wrote, accepted or provisional, newest first. */
function requestOf(snapshot: CaseSnapshot, commandId: string): NonNullable<Readout["request"]> {
  const tasks = new Set(
    snapshot.records.taskRecords.filter((t) => t.commandId === commandId).map((t) => t.id),
  );
  const findings = snapshot.records.evidenceRecords
    .filter(
      (e) =>
        (e.status === "accepted" || e.status === "provisional") &&
        tasks.has(e.provenance.generatedByTaskId ?? ""),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .map((e) => ({
      id: e.id,
      text: datedText(readableStatement(snapshot, e.statement)),
      claimKind: e.claimKind,
    }));
  return { commandId, findings };
}

/**
 * The readout of one case record, with the arc's findings computed from that same record. `limits` are the two
 * elevation band limits the land is drawn with, which decide which checks it can light (the record's own,
 * bandLimitsOf, when left out; null for none); `commandId` names a follow-up request whose own findings it lists.
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
  return {
    answer,
    explanations,
    verdicts: verdictsOf(explanations, answer),
    ground: groundOf(snapshot, merge, explanations?.rows ?? [], limits),
    request: opts.commandId ? requestOf(snapshot, opts.commandId) : null,
  };
}

/**
 * What a check would tell apart, in one sentence: "Local rain records would tell rainfall from grazing."; a check
 * that alone tells nothing apart is named on its own: "Orchard planting years."
 */
export function nextWords(check: Pick<GroundCheck, "what" | "separates">): string {
  const what = sentenceCase(check.what);
  return check.separates.length
    ? rformat("readout.next.separates", {
        check: what,
        pairs: joinWords(check.separates.map((p) => rformat("readout.next.pair", p))),
      })
    : rformat("readout.next.check", { check: what });
}

/** A follow-up's finding as a sentence; a hypothesis or a scenario says so first, since neither states a fact. */
export function findingWords(f: Pick<RequestFinding, "text" | "claimKind">): string {
  return f.claimKind === "hypothesis"
    ? rformat("readout.request.hypothesis", { text: f.text })
    : f.claimKind === "scenario"
      ? rformat("readout.request.scenario", { text: f.text })
      : f.text;
}

/** A follow-up with this many findings or fewer shows them whole; a longer one shows its first ones and a row. */
const WHOLE_FINDINGS = 3;
/** How many of a longer follow-up's findings show before that row: two full ones keep the verdicts, the next checks
 *  and the views in sight at 1440 by 900 (three made about twelve lines and pushed the views under the fade). */
const FIRST_FINDINGS = 2;

/**
 * A follow-up's findings as the column shows them, so they never push the rest of the column out of sight: three or
 * fewer whole, with no row (a row never hides a single finding); more than three, the first two in the order the record
 * dates them with one row that shows all of them, and once that row is pressed every finding with a row that shows
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
