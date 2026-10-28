import {
  ProposeInterventions,
  interventionReviewRoles,
  toModelJsonSchema,
} from "@siterra/contracts";
import { PROHIBITED_RULES, unprovenNumbers } from "@siterra/domain/validators";
import type { YearSpan } from "@siterra/domain/validators";

import type { JsonSchema } from "../../model/types.ts";
import { maskReferencePeriods, referencePeriods, unprovenMessage } from "../evidence/proposal.ts";
import { PROBABILITY, RANKING } from "../hypothesis/proposal.ts";
import type { EvidenceRecord, HypothesisRecord, MeasurementRecord } from "../records.ts";
import { LIVELIHOOD_RULES } from "../source/source-task.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";

// propose_interventions (docs/reference/data-contracts.md#tool-argument-contracts; the Intervention
// row: conditions, assumptions, livelihood and ecological considerations, required review roles,
// no benefit numbers), with the argument schema from packages/contracts. A candidate response
// states the condition it rests on and who must review it; it never ranks, recommends, forecasts an
// effect or states a number its cited evidence does not hold.

/** The review roles in catalog order (packages/contracts). */
export const REVIEW_ROLES = interventionReviewRoles;

/**
 * The model writes two or three candidate responses; host code adds "Defer until the field check"
 * from fixed text, so the comparison holds three or four (components.md CMP-12, lead decision
 * after b34). The model never writes or omits the deferral.
 */
export const INTERVENTION_LIMITS = {
  minItems: 2,
  maxItems: 3,
  titleChars: 120,
  descriptionChars: 800,
  listItems: 8,
  listItemChars: 300,
} as const;

export type InterventionItem = ProposeInterventions["items"][number];

export function interventionOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposeInterventions);
}

/** The condition a candidate response rests on ("If the field check confirms ...", "Once ..."). */
const CONDITION = /\b(?:if|unless|once|provided|when|after|before|until|subject to)\b/i;

/** Recommendation language (voice-and-tone VT-23): a candidate response is never a recommendation. */
const RECOMMENDATION =
  /\b(?:recommend(?:s|ed|ing|ation|ations)?|should (?:adopt|implement|choose)|the best (?:option|response|choice)|(?:preferred|top) (?:option|response))\b/i;

/**
 * Directives and advice (ADR-0033, voice principle 4): a candidate response says what could be
 * done under a condition, never what someone must, should or ought to do (b34).
 */
const DIRECTIVE =
  /\b(?:must|should|ought\s+to|needs?\s+to|has\s+to|have\s+to)\s+\w+|\badvis(?:e|es|ed|able)\b/i;

/**
 * A present-tense effect of the response (b34): "restores cover", "helps vegetation recover",
 * "results in", "the most effective response". Stating what a response aims at ("aims to reduce",
 * "is meant to") is not an effect.
 */
const PRESENT_EFFECT =
  /\b(?:restores|improves|reduces|increases|raises|lowers|boosts|enhances|protects|prevents|secures|stabili[sz]es|regenerates|benefits|recovers|revives)\b|\bhelp(?:s|ing)?\s+(?:[\w-]+\s+){0,3}?(?:recover|improve|restore|regenerate|reduce|increase|protect|prevent)\b|\bresult(?:s|ed|ing)?\s+in\b|\b(?:most|more|less|least)\s+(?:effective|efficient)\b|\beffective\s+(?:response|option|measure|approach)\b/i;

/**
 * A sentence that opens with a command ("Close the upper pastures if ...", "Make no change ..."):
 * an imperative directs as a modal does (lead after b39). The verbs are a fixed list, so a noun
 * such as "rest timing" passes.
 */
const IMPERATIVE =
  /(?:^|[.;:!?]\s+)(?:close|ban|stop|restrict|reduce|limit|prohibit|enforce|exclude|fence|make|keep|ensure|require|apply|implement|adopt|introduce|impose|forbid|avoid|halt|suspend|cease|relocate|consult|contact|send|schedule|tell|ask|do not|don't)\b/i;

/** The deferral option's title (CMP-12); host code writes it, so a model item with it is refused. */
export const DEFERRAL_TITLE = "Defer until the field check";
const DEFERRAL = /^\s*defer\b/i;

/** RANKING's forms for responses rather than explanations ("the stronger response"). */
const RESPONSE_RANKING =
  /\b(?:stronger|strongest|weaker|weakest|better|best|worse|worst|leading|main|primary|preferred|favou?red|top)\s+(?:[\w-]+\s+)?(?:responses?|options?|choices?)\b/i;

/**
 * A predicted effect of the response (analysis-recipes.md: no intervention outcomes or household
 * effects are forecast): a modal or "expected to" before an effect verb, with at most one word
 * between. Stating what a response aims at ("aims to reduce") is not a prediction.
 */
const PREDICTED_EFFECT =
  /\b(?:will|would|could|can|may|might|shall|(?:is|are) (?:expected|likely|projected) to|expected to)\s+(?:\w+\s+)?(?:increase|improve|reduce|restore|recover|raise|boost|double|halve|lower|cut|save|benefit|enhance|regenerate|protect|prevent|secure|stabili[sz]e)\b/i;

export interface AcceptedIntervention {
  item: InterventionItem;
  evidence: EvidenceRecord[];
  hypotheses: HypothesisRecord[];
}

export interface InterventionContext {
  /** Accepted evidence the task may cite, by ID. */
  evidence: ReadonlyMap<string, EvidenceRecord>;
  /** Hypotheses the task may build on, by ID. */
  hypotheses: ReadonlyMap<string, HypothesisRecord>;
  /** Measurements the cited evidence rests on, for numeric provenance. */
  measurements: ReadonlyMap<string, MeasurementRecord>;
  years: YearSpan | null;
}

function numbersOf(m: MeasurementRecord): number[] {
  return [m.value, m.uncertainty.lower, m.uncertainty.upper, m.validFraction].filter(
    (v): v is number => typeof v === "number",
  );
}

/** The numbers, reference periods and texts a proposal may take its numbers from. */
export interface CitedNumbers {
  allowed: number[];
  periods: ReturnType<typeof referencePeriods>;
  excerpts: string[];
}

export function citedNumbers(
  evidence: readonly EvidenceRecord[],
  measurements: ReadonlyMap<string, MeasurementRecord>,
): CitedNumbers {
  const cited = evidence.flatMap((e) =>
    e.measurementIds.flatMap((id) => {
      const m = measurements.get(id);
      return m ? [m] : [];
    }),
  );
  return {
    allowed: cited.flatMap(numbersOf),
    periods: cited.flatMap(referencePeriods),
    excerpts: evidence.flatMap((e) => [
      e.statement,
      ...e.provenance.sourceLocators.flatMap((l) => (l.excerpt ? [l.excerpt] : [])),
    ]),
  };
}

/**
 * Every rule a model-written response or plan text must pass: no probability, ranking,
 * recommendation, directive, advice or predicted effect; the shared prohibited claims; the
 * livelihood rules; and numbers only from the cited evidence (17, b34). Used by brief_package too.
 */
export function responseTextIssues(
  text: string,
  cited: CitedNumbers,
  years: YearSpan | null,
): { code: "prohibited_claim" | "numeric_provenance"; message: string }[] {
  const found: { code: "prohibited_claim" | "numeric_provenance"; message: string }[] = [];
  const add = (code: "prohibited_claim" | "numeric_provenance", message: string): void => {
    found.push({ code, message });
  };
  if (PROBABILITY.test(text)) add("prohibited_claim", "No probability or ranking is stated.");
  const ranked = RANKING.exec(text) ?? RESPONSE_RANKING.exec(text);
  if (ranked) add("prohibited_claim", `"${ranked[0]}" ranks responses; they are not ranked.`);
  const recommended = RECOMMENDATION.exec(text);
  if (recommended)
    add("prohibited_claim", `"${recommended[0]}" recommends; say "candidate response" instead.`);
  const directive = DIRECTIVE.exec(text);
  if (directive) {
    add(
      "prohibited_claim",
      `"${directive[0]}" directs or advises; say what could be done and under which condition.`,
    );
  }
  const imperative = IMPERATIVE.exec(text);
  if (imperative) {
    add(
      "prohibited_claim",
      `"${imperative[0].trim()}" opens with a command; write a noun phrase or a description instead, such as "Consultation with the commune council on the access calendar".`,
    );
  }
  const effect = PREDICTED_EFFECT.exec(text) ?? PRESENT_EFFECT.exec(text);
  if (effect) {
    add(
      "prohibited_claim",
      `"${effect[0]}" predicts an effect of the response; state the condition and what would show it instead.`,
    );
  }
  for (const rule of PROHIBITED_RULES) {
    const m = rule.pattern.exec(text);
    if (m) add("prohibited_claim", `"${m[0]}" ${rule.reason}.`);
  }
  for (const rule of LIVELIHOOD_RULES) {
    const reason = rule.check(text, years);
    if (reason !== null) add("prohibited_claim", reason);
  }
  const claim = maskReferencePeriods(text, cited.periods);
  for (const n of unprovenNumbers(claim, cited.allowed, cited.excerpts, years)) {
    add("numeric_provenance", unprovenMessage(n));
  }
  return found;
}

const LISTS = [
  "assumptions",
  "ecologicalConsiderations",
  "livelihoodConsiderations",
  "fieldValidationNeeded",
] as const;

export function validateInterventionProposal(
  outputText: string,
  context: InterventionContext,
): Checked<AcceptedIntervention[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = ProposeInterventions.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const { items } = parsed.data;
  if (items.length < INTERVENTION_LIMITS.minItems || items.length > INTERVENTION_LIMITS.maxItems) {
    return {
      ok: false,
      issues: [
        issue(
          "limit",
          "$.items",
          `Give ${INTERVENTION_LIMITS.minItems} or ${INTERVENTION_LIMITS.maxItems} candidate responses; Siterra adds "${DEFERRAL_TITLE}" itself.`,
        ),
      ],
    };
  }

  const accepted: AcceptedIntervention[] = [];
  const issues: ValidationIssue[] = [];
  const titles = new Set<string>();
  items.forEach((item, i) => {
    const at = `$.items[${i}]`;
    const own: ValidationIssue[] = [];
    const add = (code: Parameters<typeof issue>[0], path: string, message: string): void => {
      own.push(issue(code, `${at}.${path}`, message));
    };

    const title = item.title.trim();
    if (title === "") add("schema", "title", "Title is empty.");
    if (title.length > INTERVENTION_LIMITS.titleChars)
      add("limit", "title", `At most ${INTERVENTION_LIMITS.titleChars} characters.`);
    if (titles.has(title.toLowerCase()))
      add("schema", "title", "Another candidate response has this title.");
    if (DEFERRAL.test(title)) {
      add(
        "claim_kind",
        "title",
        `Siterra adds "${DEFERRAL_TITLE}" itself; give the other candidate responses.`,
      );
    }
    titles.add(title.toLowerCase());
    if (item.description.trim() === "") add("schema", "description", "Description is empty.");
    if (item.description.length > INTERVENTION_LIMITS.descriptionChars)
      add("limit", "description", `At most ${INTERVENTION_LIMITS.descriptionChars} characters.`);
    if (!CONDITION.test(item.description)) {
      add(
        "claim_kind",
        "description",
        "A candidate response states the condition it rests on (if, once, provided, unless, until).",
      );
    }
    for (const list of LISTS) {
      const values = item[list];
      if (values.length > INTERVENTION_LIMITS.listItems)
        add("limit", list, `At most ${INTERVENTION_LIMITS.listItems} items.`);
      values.forEach((v, j) => {
        if (v.trim() === "") add("schema", `${list}[${j}]`, "Item is empty.");
        if (v.length > INTERVENTION_LIMITS.listItemChars)
          add("limit", `${list}[${j}]`, `At most ${INTERVENTION_LIMITS.listItemChars} characters.`);
      });
    }
    if (item.assumptions.length === 0)
      add("claim_kind", "assumptions", "Name at least one assumption the response rests on.");
    if (item.fieldValidationNeeded.length === 0) {
      add(
        "claim_kind",
        "fieldValidationNeeded",
        "Name at least one field prerequisite to check before relying on it.",
      );
    }
    if (item.requiredReviewRoles.length === 0)
      add("claim_kind", "requiredReviewRoles", "Name at least one review role.");
    if (new Set(item.requiredReviewRoles).size !== item.requiredReviewRoles.length)
      add("schema", "requiredReviewRoles", "Each review role appears once.");

    const evidence = item.evidenceIds.flatMap((id, j) => {
      const e = context.evidence.get(id);
      if (!e) {
        add(
          "unknown_reference",
          `evidenceIds[${j}]`,
          `${id} is not accepted evidence available to this task.`,
        );
        return [];
      }
      return [e];
    });
    const hypotheses = item.hypothesisIds.flatMap((id, j) => {
      const h = context.hypotheses.get(id);
      if (!h) {
        add(
          "unknown_reference",
          `hypothesisIds[${j}]`,
          `${id} is not a hypothesis available to this task.`,
        );
        return [];
      }
      // proposes_response means "if the explanation holds"; a contradicted or stale one does not.
      if (h.status === "inconsistent" || h.status === "stale") {
        add(
          "claim_kind",
          `hypothesisIds[${j}]`,
          `${id} is ${h.status === "stale" ? "stale" : "contradicted by available evidence"}; a candidate response cannot rest on it.`,
        );
        return [];
      }
      return [h];
    });
    if (item.evidenceIds.length + item.hypothesisIds.length === 0)
      add("claim_kind", "evidenceIds", "Cite the evidence or hypotheses the response rests on.");

    const cited = citedNumbers(evidence, context.measurements);
    const texts: [string, string][] = [
      ["title", item.title],
      ["description", item.description],
      ...LISTS.flatMap((list) => item[list].map((v, j): [string, string] => [`${list}[${j}]`, v])),
    ];
    for (const [path, text] of texts) {
      for (const found of responseTextIssues(text, cited, context.years)) {
        add(found.code, path, found.message);
      }
    }

    if (own.length > 0) issues.push(...own);
    else accepted.push({ item: { ...item, title }, evidence, hypotheses });
  });
  return accepted.length > 0 ? { ok: true, value: accepted, issues } : { ok: false, issues };
}
