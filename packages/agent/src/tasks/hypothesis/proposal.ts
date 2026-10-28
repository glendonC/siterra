import { ProposeHypotheses, toModelJsonSchema } from "@siterra/contracts";
import type { proposableHypothesisStatuses } from "@siterra/contracts";
import { PROHIBITED_RULES, unprovenNumbers } from "@siterra/domain/validators";
import type { YearSpan } from "@siterra/domain/validators";

import type { JsonSchema } from "../../model/types.ts";
import { maskReferencePeriods, referencePeriods, unprovenMessage } from "../evidence/proposal.ts";
import type { EvidenceRecord, HypothesisRecord, MeasurementRecord } from "../records.ts";
import { OUT_OF_SCOPE, scopeIssues } from "../scope.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";

// propose_hypotheses (docs/reference/data-contracts.md#tool-argument-contracts and #hypothesis-status),
// with the argument schema from packages/contracts. A hypothesis is a candidate explanation: its
// status word must match the evidence, its text must carry that word, and no probability is ever
// stated.

export type ProposedStatus = (typeof proposableHypothesisStatuses)[number];

/** The status words of the data contract, which every assessment must carry in its own words. */
export const STATUS_LABELS: Readonly<Record<ProposedStatus, string>> = {
  untested: "Not yet tested",
  consistent: "Consistent with available evidence",
  inconsistent: "Contradicted by available evidence",
  inconclusive: "Cannot be assessed with current data",
};

export const HYPOTHESIS_LIMITS = {
  maxItems: 6,
  statementChars: 400,
  assessmentChars: 1200,
  maxMissing: 8,
} as const;

export type HypothesisItem = ProposeHypotheses["items"][number];

export function hypothesisOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposeHypotheses);
}

/** Probability and ranking language a hypothesis may never carry (data-contracts.md: never a probability). */
export const PROBABILITY =
  /\b(?:probab\w*|likelihood|likely|unlikely|odds|chance|percent(?:age)? (?:likely|chance)|confidence (?:of|level)|most plausible|best explanation|ranked?)\b|\d+(?:\.\d+)?\s*%\s*(?:likely|chance|probab\w*)/i;

/**
 * Comparatives that rank explanations, which the ledger never does (data-contracts.md: several
 * may be consistent at once; never ranked by a score). Refused in every hypothesis text (a60,
 * b13, b17). Forms, not a word list: a ranking adjective before an explanation noun, with at most
 * one word between ("the weaker grazing explanation"); a degree word before plausible, supported,
 * consistent and the like; fitting, explaining or accounting "better"; favouring one over
 * another; ahead of; outweighing; explaining more. A bare "than" stays allowed, so measurement
 * comparisons such as "lower than the 1991 to 2020 mean" pass.
 */
export const RANKING = new RegExp(
  `\\b(?:${[
    String.raw`(?:stronger|strongest|weaker|weakest|better|best|worse|worst|leading|main|primary|principal|dominant|preferred|favou?red|likelier|likeliest)\s+(?:[\w-]+\s+)?(?:explanation|explanations|hypothesis|hypotheses|candidate|driver|cause|reason|factor|account|case)`,
    String.raw`favou?r(?:s|ed|ing)?\b[^.;:]{0,80}?\bover`,
    String.raw`ahead\s+of`,
    String.raw`(?:more|less|most|least|better|best|worse|worst)[\s-]+(?:well[\s-]+)?(?:plausible|likely|convincing|probable|credible|supported|consistent|fitting|founded)`,
    String.raw`(?:better|worse|best|worst|closer)\s+fit`,
    String.raw`(?:fit|explain|account)(?:s|ed|ted|ing|ting)?\b[^.;:]{0,80}?\b(?:better|worse|best|worst)`,
    String.raw`explain(?:s|ed)?\s+(?:more|less|most)`,
    String.raw`outweigh(?:s|ed|ing)?`,
  ].join("|")})\\b`,
  "i",
);

/**
 * A hypothesis is never confirmed or proven: the statuses stop at "consistent with available
 * evidence" (SA-06: without grazing measurements, grazing attribution cannot be labeled confirmed).
 * Refused in the statement and the assessment; missing evidence may name a check that would confirm
 * something, and the present tense "confirms" stays allowed for that reason.
 */
export const CONFIRMATION =
  /\b(?:confirmed|confirmation|proven|proved|conclusively|definitively|beyond (?:doubt|question))\b/i;

/**
 * Only the statement of a hypothesis is a candidate explanation and may name a cause; the
 * assessment and the missing evidence keep every prohibited-claims rule, the causal one included
 * (AUDIT a60).
 */
const STATEMENT_RULES = PROHIBITED_RULES.filter((r) => r.id !== "causal");

export interface AcceptedHypothesis {
  item: HypothesisItem;
  previous: HypothesisRecord | null;
  supporting: EvidenceRecord[];
  contradicting: EvidenceRecord[];
}

export interface HypothesisContext {
  /** Accepted evidence the task may cite, by ID. */
  evidence: ReadonlyMap<string, EvidenceRecord>;
  /** Measurements the cited evidence rests on, for numeric provenance. */
  measurements: ReadonlyMap<string, MeasurementRecord>;
  /** Existing hypotheses a proposal may revise. */
  hypotheses: ReadonlyMap<string, HypothesisRecord>;
  years: YearSpan | null;
}

function numbersOf(m: MeasurementRecord): number[] {
  return [m.value, m.uncertainty.lower, m.uncertainty.upper, m.validFraction].filter(
    (v): v is number => typeof v === "number",
  );
}

export function validateHypothesisProposal(
  outputText: string,
  context: HypothesisContext,
): Checked<AcceptedHypothesis[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = ProposeHypotheses.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const { items } = parsed.data;
  if (items.length === 0)
    return { ok: false, issues: [issue("limit", "$.items", "No hypotheses.")] };
  if (items.length > HYPOTHESIS_LIMITS.maxItems) {
    return {
      ok: false,
      issues: [issue("limit", "$.items", `At most ${HYPOTHESIS_LIMITS.maxItems} hypotheses.`)],
    };
  }

  // One out-of-scope item ends the whole proposal: no hypothesis is committed and none is repaired.
  const outside = scopeIssues(
    items.flatMap((item, i) => [
      [`$.items[${i}].statement`, item.statement] as const,
      [`$.items[${i}].assessment`, item.assessment] as const,
      ...item.missingEvidence.map((m, k) => [`$.items[${i}].missingEvidence[${k}]`, m] as const),
    ]),
  );
  if (outside.length > 0) return { ok: false, issues: outside, failureCode: OUT_OF_SCOPE };

  const accepted: AcceptedHypothesis[] = [];
  const issues: ValidationIssue[] = [];
  items.forEach((item, i) => {
    const at = `$.items[${i}]`;
    const own: ValidationIssue[] = [];
    const add = (code: Parameters<typeof issue>[0], path: string, message: string): void => {
      own.push(issue(code, `${at}.${path}`, message));
    };

    if (item.statement.trim() === "") add("schema", "statement", "Statement is empty.");
    if (item.statement.length > HYPOTHESIS_LIMITS.statementChars)
      add("limit", "statement", `At most ${HYPOTHESIS_LIMITS.statementChars} characters.`);
    if (item.assessment.length > HYPOTHESIS_LIMITS.assessmentChars)
      add("limit", "assessment", `At most ${HYPOTHESIS_LIMITS.assessmentChars} characters.`);
    if (item.missingEvidence.length > HYPOTHESIS_LIMITS.maxMissing)
      add("limit", "missingEvidence", `At most ${HYPOTHESIS_LIMITS.maxMissing} items.`);

    const previous =
      item.hypothesisId === null ? null : (context.hypotheses.get(item.hypothesisId) ?? null);
    if (item.hypothesisId !== null && previous === null) {
      add(
        "unknown_reference",
        "hypothesisId",
        `${item.hypothesisId} is not a hypothesis in this case.`,
      );
    }

    const resolve = (ids: readonly string[], field: string): EvidenceRecord[] =>
      ids.flatMap((id, j) => {
        const e = context.evidence.get(id);
        if (!e) {
          add(
            "unknown_reference",
            `${field}[${j}]`,
            `${id} is not accepted evidence available to this task.`,
          );
          return [];
        }
        return [e];
      });
    const supporting = resolve(item.supportingEvidenceIds, "supportingEvidenceIds");
    const contradicting = resolve(item.contradictingEvidenceIds, "contradictingEvidenceIds");
    const both = item.supportingEvidenceIds.filter((id) =>
      item.contradictingEvidenceIds.includes(id),
    );
    if (both.length > 0)
      add(
        "claim_kind",
        "contradictingEvidenceIds",
        `${both.join(", ")} cannot both support and contradict.`,
      );

    switch (item.status) {
      case "untested":
        if (supporting.length + contradicting.length > 0) {
          add(
            "claim_kind",
            "status",
            "An untested hypothesis cites no supporting or contradicting evidence.",
          );
        }
        break;
      case "consistent":
        if (supporting.length === 0)
          add("claim_kind", "status", "A consistent hypothesis needs supporting evidence.");
        if (item.contradictingEvidenceIds.length > 0) {
          add(
            "claim_kind",
            "status",
            "Evidence contradicts it, so it is not consistent with the available evidence.",
          );
        }
        break;
      case "inconsistent":
        if (!contradicting.some((e) => e.claimKind === "observation")) {
          add(
            "claim_kind",
            "status",
            "Inconsistent needs at least one accepted observation that contradicts it.",
          );
        }
        break;
      case "inconclusive":
        if (item.missingEvidence.every((m) => m.trim() === "")) {
          add(
            "claim_kind",
            "missingEvidence",
            "Cannot be assessed needs the missing evidence named.",
          );
        }
        break;
    }

    const label = STATUS_LABELS[item.status];
    if (!item.assessment.toLowerCase().includes(label.toLowerCase())) {
      add("claim_kind", "assessment", `The assessment must say "${label}".`);
    }

    const cited = [...supporting, ...contradicting];
    const citedMeasurements = cited.flatMap((e) =>
      e.measurementIds.flatMap((id) => {
        const m = context.measurements.get(id);
        return m ? [m] : [];
      }),
    );
    const allowed = citedMeasurements.flatMap(numbersOf);
    // The reference periods the cited measurements define, as the evidence check reads them (a49).
    const periods = citedMeasurements.flatMap(referencePeriods);
    const excerpts = cited.flatMap((e) => [
      e.statement,
      ...e.provenance.sourceLocators.flatMap((l) => (l.excerpt ? [l.excerpt] : [])),
    ]);
    const texts: [string, string][] = [
      ["statement", item.statement],
      ["assessment", item.assessment],
      ...item.missingEvidence.map((m, k): [string, string] => [`missingEvidence[${k}]`, m]),
    ];
    for (const [path, text] of texts) {
      if (PROBABILITY.test(text))
        add(
          "prohibited_claim",
          path,
          "A hypothesis carries no probability, likelihood or ranking.",
        );
      const ranked = RANKING.exec(text);
      if (ranked)
        add(
          "prohibited_claim",
          path,
          `"${ranked[0]}" ranks explanations; several may fit at once.`,
        );
      const confirmed = path.startsWith("missingEvidence") ? null : CONFIRMATION.exec(text);
      if (confirmed)
        add(
          "prohibited_claim",
          path,
          `"${confirmed[0]}" labels a hypothesis confirmed; the strongest status is "${STATUS_LABELS.consistent}".`,
        );
      for (const rule of path === "statement" ? STATEMENT_RULES : PROHIBITED_RULES) {
        const m = rule.pattern.exec(text);
        if (m) add("prohibited_claim", path, `"${m[0]}" ${rule.reason}.`);
      }
      const claim = maskReferencePeriods(text, periods);
      for (const n of unprovenNumbers(claim, allowed, excerpts, context.years)) {
        add("numeric_provenance", path, unprovenMessage(n));
      }
    }

    if (own.length > 0) issues.push(...own);
    else
      accepted.push({
        item: { ...item, statement: item.statement.trim() },
        previous,
        supporting,
        contradicting,
      });
  });
  return accepted.length > 0 ? { ok: true, value: accepted, issues } : { ok: false, issues };
}
