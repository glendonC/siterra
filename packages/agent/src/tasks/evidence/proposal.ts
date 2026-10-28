import { ProposeEvidence, toModelJsonSchema } from "@siterra/contracts";
import {
  checkExcerpt,
  claimRuleIssues,
  parseLocator,
  prohibitedHits,
  unprovenNumbers,
} from "@siterra/domain/validators";
import type { YearSpan } from "@siterra/domain/validators";

import type { JsonSchema } from "../../model/types.ts";
import type { CaseStore, StoredSource } from "../../tools/store.ts";
import type { ClaimKind, DataBundleRecord, MeasurementRecord } from "../records.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";

// propose_evidence (docs/reference/data-contracts.md#tool-argument-contracts): the schema is
// ProposeEvidence from packages/contracts. Items are validated one by one; valid items commit and rejected ones are listed,
// which is a partial result (docs/reference/data-contracts.md#idempotency-revisions-and-recovery).

export const CLAIM_KINDS = [
  "observation",
  "scientific_context",
  "hypothesis",
  "model_estimate",
  "scenario",
  "field_requirement",
  "verified_outcome",
] as const;

export const EVIDENCE_LIMITS = {
  maxItems: 10,
  statementChars: 600,
  noteChars: 300,
  maxLimitations: 5,
} as const;

export const EvidenceProposal = ProposeEvidence;

export type EvidenceProposal = ProposeEvidence;
export type EvidenceItem = EvidenceProposal["items"][number];

export function evidenceOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposeEvidence);
}

/** An item that passed validation, with the records its numbers were checked against. */
export interface AcceptedItem {
  item: EvidenceItem;
  measurements: MeasurementRecord[];
  bundles: DataBundleRecord[];
  /** The cited source of a published-context item, with its excerpt verified on the cited page. */
  source: StoredSource | null;
}

const EXCERPT_REASONS = {
  empty: "The excerpt is empty.",
  too_long: "The excerpt is longer than 300 characters.",
  not_found: "The excerpt is not in the stored text of the cited page.",
} as const;

export interface EvidenceContext {
  caseId: string;
  store: CaseStore;
  /** Claim kinds this task may propose; `verified_outcome` is rejected in P0 regardless. */
  allowedClaimKinds: ReadonlySet<ClaimKind>;
}

/** The calendar years the case's bundles cover; a bare year in model text is a date only inside them. */
export function caseYearSpan(periodIds: readonly string[]): YearSpan | null {
  const years = periodIds.flatMap((p) => {
    const m = /^period_(\d{4})-\d{2}$/.exec(p);
    return m?.[1] ? [Number(m[1])] : [];
  });
  return years.length === 0 ? null : { first: Math.min(...years), last: Math.max(...years) };
}

/** The numbers a cited measurement holds: its value, spread, coverage and counts. */
function measurementNumbers(m: MeasurementRecord): number[] {
  const values = [
    m.value,
    m.uncertainty.lower,
    m.uncertainty.upper,
    m.validFraction,
    m.validPixelCount,
    m.totalPixelCount,
  ];
  return values.filter((v): v is number => typeof v === "number");
}

/** A reference period stated in a measurement's definition, such as 1991 to 2020. */
export interface ReferencePeriod {
  first: number;
  last: number;
}

// Digit lookarounds, not \b: in "from_1991_2020" the underscore is a word character.
const PERIOD_IN_DEFINITION =
  /(?<!\d)((?:19|20)\d{2})(?:[\s_-]+(?:to[\s_-]+)?|\s*\u2013\s*)((?:19|20)\d{2})(?!\d)/g;

/**
 * Reference periods a measurement's own definition states, in its metric name or aggregation text
 * ("precipitation_departure_from_1991_2020_mean"). Only these year pairs come from a definition;
 * every other number in it (pixel counts, grid sizes, EPSG codes) does not (AUDIT a49).
 */
export function referencePeriods(m: MeasurementRecord): ReferencePeriod[] {
  const periods: ReferencePeriod[] = [];
  for (const text of [m.metric, m.aggregation]) {
    for (const match of text.matchAll(PERIOD_IN_DEFINITION)) {
      const first = Number(match[1]);
      const last = Number(match[2]);
      if (first < last) periods.push({ first, last });
    }
  }
  return periods;
}

/**
 * Blanks each cited reference period where the claim repeats it as a range ("1991 to 2020",
 * "1991-2020", "1991 and 2020"), so its two years are read as the measurement's own definition.
 * A year of the period written anywhere else stays a number to prove.
 */
export function maskReferencePeriods(text: string, periods: readonly ReferencePeriod[]): string {
  let masked = text;
  for (const { first, last } of periods) {
    const range = new RegExp(
      String.raw`\b${String(first)}\s*(?:to|-|\u2013|and)\s*${String(last)}\b`,
      "g",
    );
    masked = masked.replace(range, (m) => " ".repeat(m.length));
  }
  return masked;
}

/** The forms in which a year reads as a date (AUDIT a46, lead 21:38:02). */
export const YEAR_FORMS = '"in April 2022", "In 2022," or "... in 2022."';

/** The repair message for an unproven number; a four-digit one may be a year written as a count. */
export function unprovenMessage(n: string): string {
  const base = `${n} matches no cited measurement, date, period or excerpt.`;
  return /^(?:19|20)\d{2}$/.test(n) ? `${base} If it is a year, write it as ${YEAR_FORMS}` : base;
}

export async function validateEvidenceProposal(
  outputText: string,
  context: EvidenceContext,
): Promise<Checked<AcceptedItem[]>> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = EvidenceProposal.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const { items } = parsed.data;
  if (items.length === 0)
    return { ok: false, issues: [issue("limit", "$.items", "No evidence items.")] };
  if (items.length > EVIDENCE_LIMITS.maxItems) {
    return {
      ok: false,
      issues: [issue("limit", "$.items", `At most ${EVIDENCE_LIMITS.maxItems} items.`)],
    };
  }

  const ids = [...new Set(items.flatMap((i) => i.measurementIds))];
  const measurements = new Map(
    (await context.store.readMeasurementsById(context.caseId, ids)).map((m) => [m.id, m]),
  );
  const bundleIds = [...new Set([...measurements.values()].map((m) => m.dataBundleId))];
  const bundles = new Map<string, DataBundleRecord>();
  for (const id of bundleIds) {
    const bundle = await context.store.readBundle(context.caseId, id);
    if (bundle) bundles.set(id, bundle);
  }

  const years = caseYearSpan(
    (await context.store.listBundles(context.caseId)).flatMap((b) => b.periodIds),
  );
  const sourceIds = [...new Set(items.flatMap((i) => (i.sourceId === null ? [] : [i.sourceId])))];
  const sources = new Map<string, StoredSource>();
  for (const id of sourceIds) {
    const source = await context.store.readSource(context.caseId, id);
    if (source) sources.set(id, source);
  }
  // Stored text at each cited locator, keyed by source and locator text.
  const passageTexts = new Map<string, string>();
  for (const item of items) {
    const source = item.sourceId === null ? undefined : sources.get(item.sourceId);
    const locator = item.locator === null ? null : parseLocator(item.locator);
    if (source?.accessStatus !== "retrieved" || locator === null || item.locator === null) continue;
    const key = `${source.id}#${item.locator.trim()}`;
    if (passageTexts.has(key)) continue;
    const passage = await context.store.passageAt(context.caseId, source.id, locator);
    if (passage) passageTexts.set(key, passage.text);
  }

  const accepted: AcceptedItem[] = [];
  const issues: ValidationIssue[] = [];
  items.forEach((item, i) => {
    const at = `$.items[${i}]`;
    const itemIssues: ValidationIssue[] = [];
    const statement = item.statement.trim();
    if (statement === "")
      itemIssues.push(issue("schema", `${at}.statement`, "Statement is empty."));
    if (statement.length > EVIDENCE_LIMITS.statementChars) {
      itemIssues.push(
        issue(
          "limit",
          `${at}.statement`,
          `Statement exceeds ${EVIDENCE_LIMITS.statementChars} characters.`,
        ),
      );
    }
    if (item.scopeNote.length > EVIDENCE_LIMITS.noteChars) {
      itemIssues.push(
        issue(
          "limit",
          `${at}.scopeNote`,
          `Scope note exceeds ${EVIDENCE_LIMITS.noteChars} characters.`,
        ),
      );
    }
    if (item.limitations.length > EVIDENCE_LIMITS.maxLimitations) {
      itemIssues.push(
        issue(
          "limit",
          `${at}.limitations`,
          `At most ${EVIDENCE_LIMITS.maxLimitations} limitations.`,
        ),
      );
    }
    const source = item.sourceId === null ? null : (sources.get(item.sourceId) ?? null);
    if (item.sourceId !== null && source === null) {
      itemIssues.push(
        issue(
          "unknown_reference",
          `${at}.sourceId`,
          `${item.sourceId} is not a source in this case.`,
        ),
      );
    }
    const sourceRetrieved = source === null ? null : source.accessStatus === "retrieved";
    const ruleIssues = claimRuleIssues({ ...item, sourceRetrieved }, context.allowedClaimKinds);
    for (const rule of ruleIssues) {
      itemIssues.push(issue(rule.code, `${at}.${rule.field}`, rule.message));
    }

    const verifiedExcerpts: string[] = [];
    if (
      item.claimKind === "scientific_context" &&
      ruleIssues.length === 0 &&
      source &&
      item.locator &&
      item.excerpt
    ) {
      const locator = parseLocator(item.locator);
      const text = passageTexts.get(`${source.id}#${item.locator.trim()}`);
      if (locator === null) {
        itemIssues.push(
          issue(
            "excerpt_mismatch",
            `${at}.locator`,
            "Copy the locator read_source returned for the passage.",
          ),
        );
      } else if (text === undefined) {
        itemIssues.push(
          issue("excerpt_mismatch", `${at}.locator`, `No stored text at ${item.locator.trim()}.`),
        );
      } else {
        const check = checkExcerpt(item.excerpt, text);
        if (check.ok) verifiedExcerpts.push(item.excerpt);
        else
          itemIssues.push(
            issue("excerpt_mismatch", `${at}.excerpt`, EXCERPT_REASONS[check.reason]),
          );
      }
    }

    const cited: MeasurementRecord[] = [];
    item.measurementIds.forEach((id, j) => {
      const m = measurements.get(id);
      if (!m) {
        itemIssues.push(
          issue(
            "unknown_reference",
            `${at}.measurementIds[${j}]`,
            `${id} is not a measurement in this case.`,
          ),
        );
        return;
      }
      const bundle = bundles.get(m.dataBundleId);
      if (bundle?.status !== "validated") {
        itemIssues.push(
          issue(
            "stale_reference",
            `${at}.measurementIds[${j}]`,
            `${id} is not from a validated bundle.`,
          ),
        );
        return;
      }
      cited.push(m);
    });

    const texts: [string, string][] = [
      [`${at}.statement`, statement],
      [`${at}.scopeNote`, item.scopeNote],
      ...item.limitations.map((l, k): [string, string] => [`${at}.limitations[${k}]`, l]),
    ];
    const allowed = cited.flatMap(measurementNumbers);
    const periods = cited.flatMap(referencePeriods);
    for (const [path, text] of texts) {
      const claim = maskReferencePeriods(text, periods);
      for (const n of unprovenNumbers(claim, allowed, verifiedExcerpts, years)) {
        itemIssues.push(issue("numeric_provenance", path, unprovenMessage(n)));
      }
      for (const hit of prohibitedHits(text)) {
        itemIssues.push(issue("prohibited_claim", path, `"${hit.phrase}" ${hit.reason}.`));
      }
    }

    if (itemIssues.length > 0) {
      issues.push(...itemIssues);
      return;
    }
    accepted.push({
      item: { ...item, statement },
      measurements: cited,
      bundles: [...new Set(cited.map((m) => m.dataBundleId))].flatMap((id) => {
        const b = bundles.get(id);
        return b ? [b] : [];
      }),
      source: item.claimKind === "scientific_context" ? source : null,
    });
  });

  return accepted.length > 0 ? { ok: true, value: accepted, issues } : { ok: false, issues };
}
