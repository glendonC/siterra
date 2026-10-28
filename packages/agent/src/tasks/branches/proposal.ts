import type { Prediction, PredictionTest } from "@siterra/contracts";
import { ProposePredictions, toModelJsonSchema } from "@siterra/contracts";
import { testKey } from "@siterra/domain";
import { PROHIBITED_RULES, unprovenNumbers } from "@siterra/domain/validators";
import type { YearSpan } from "@siterra/domain/validators";

import type { JsonSchema } from "../../model/types.ts";
import { unprovenMessage } from "../evidence/proposal.ts";
import { CONFIRMATION, PROBABILITY, RANKING } from "../hypothesis/proposal.ts";
import { OUT_OF_SCOPE, scopeIssues } from "../scope.ts";
import { issue, jsonPath } from "../validation.ts";
import type { Checked, ValidationIssue } from "../validation.ts";
import type { BranchCatalog, PairCatalog } from "./catalog.ts";

// The independent check of one branch's predictions (ADR-0041): the closed grammar per kind, every
// target named in the catalog, and the wording rules every model text keeps. A branch's predictions
// are one set, so any issue rejects the whole proposal for one repair turn; none is dropped.

export const PREDICTION_LIMITS = { min: 2, max: 4, maxPeriods: 24, wordingChars: 300 } as const;

type Kind = PredictionTest["kind"];
type Field =
  | "pairId"
  | "side"
  | "periodIds"
  | "windowMonths"
  | "seasonId"
  | "flag"
  | "fieldCheckId"
  | "stratumId"
  | "trendSeries";

const FIELDS: readonly Field[] = [
  "pairId",
  "side",
  "periodIds",
  "windowMonths",
  "seasonId",
  "flag",
  "fieldCheckId",
  "stratumId",
  "trendSeries",
];

/** The fields each kind sets and the outcomes it may expect; every other field stays null or empty. */
export const GRAMMAR: Readonly<
  Record<Kind, { fields: readonly Field[]; expected: readonly string[] | null }>
> = {
  departure_sign: { fields: ["pairId", "side", "periodIds"], expected: ["negative", "positive"] },
  co_movement: {
    fields: ["pairId", "windowMonths"],
    expected: ["same_sign_majority", "no_same_sign_majority"],
  },
  season_category: {
    fields: ["seasonId"],
    expected: ["below_normal", "near_normal", "above_normal"],
  },
  quality_flag: {
    fields: ["pairId", "side", "periodIds", "flag"],
    expected: ["present", "absent"],
  },
  availability: {
    fields: ["pairId", "side", "periodIds"],
    expected: ["all_available", "some_unavailable"],
  },
  trend_direction: {
    fields: ["stratumId", "trendSeries"],
    expected: ["increasing", "decreasing", "flat"],
  },
  field_check: { fields: ["fieldCheckId"], expected: null },
};

export function predictionsOutputSchema(): JsonSchema {
  return toModelJsonSchema(ProposePredictions);
}

export interface PredictionContext {
  catalog: BranchCatalog;
  years: YearSpan | null;
}

const isSet = (test: PredictionTest, field: Field): boolean =>
  field === "periodIds" ? test.periodIds.length > 0 : test[field] !== null;

function targetIssues(test: PredictionTest, catalog: BranchCatalog, at: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (path: string, message: string) =>
    out.push(issue("unknown_reference", `${at}.test.${path}`, message));
  let pair: PairCatalog | undefined;
  if (test.pairId !== null) {
    pair = catalog.pairs.find((p) => p.pairId === test.pairId);
    if (!pair) add("pairId", `${test.pairId} is not a series pair of this case.`);
  }
  if (pair && test.side !== null) {
    const side = pair[test.side];
    if (side.bundle === null) {
      add("side", `No validated bundle holds side ${test.side} of ${pair.pairId}.`);
    } else {
      const known = new Set(side.periodIds);
      test.periodIds.forEach((p, j) => {
        if (!known.has(p))
          add(`periodIds[${j}]`, `${p} is not a period of ${side.bundle?.id ?? ""}.`);
      });
    }
  }
  if (pair && test.kind === "co_movement") {
    if (pair.a.bundle === null || pair.b.bundle === null) {
      add("pairId", `No validated bundles hold both sides of ${pair.pairId}.`);
    }
    if (test.windowMonths !== null && !pair.windowsMonths.includes(test.windowMonths)) {
      add(
        "windowMonths",
        `${pair.pairId} windows are ${pair.windowsMonths.join(", ")} months, not ${String(test.windowMonths)}.`,
      );
    }
  }
  if (test.seasonId !== null && !catalog.seasonIds.includes(test.seasonId)) {
    add("seasonId", `${test.seasonId} is not a season of the catalog.`);
  }
  if (test.fieldCheckId !== null && !catalog.fieldChecks.some((c) => c.id === test.fieldCheckId)) {
    add("fieldCheckId", `${test.fieldCheckId} is not a field check of this case.`);
  }
  if (test.stratumId !== null && !catalog.trendStrata.includes(test.stratumId)) {
    add("stratumId", `${test.stratumId} is not a trend stratum of the catalog.`);
  }
  return out;
}

function wordingIssues(
  text: string,
  path: string,
  allowed: readonly number[],
  years: YearSpan | null,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (code: Parameters<typeof issue>[0], message: string) =>
    out.push(issue(code, path, message));
  if (text.trim() === "") add("schema", "Wording is empty.");
  if (text.length > PREDICTION_LIMITS.wordingChars)
    add("limit", `At most ${String(PREDICTION_LIMITS.wordingChars)} characters.`);
  if (PROBABILITY.test(text))
    add("prohibited_claim", "A prediction carries no probability, likelihood or ranking.");
  const ranked = RANKING.exec(text);
  if (ranked)
    add("prohibited_claim", `"${ranked[0]}" ranks explanations; several may fit at once.`);
  const confirmed = CONFIRMATION.exec(text);
  if (confirmed) add("prohibited_claim", `"${confirmed[0]}": a prediction confirms nothing.`);
  for (const rule of PROHIBITED_RULES) {
    const m = rule.pattern.exec(text);
    if (m) add("prohibited_claim", `"${m[0]}" ${rule.reason}.`);
  }
  for (const n of unprovenNumbers(text, allowed, [], years)) {
    add("numeric_provenance", unprovenMessage(n));
  }
  return out;
}

/** Validates one branch's predictions and assigns their keys (p1 to p4) in the order given. */
export function validatePredictions(
  outputText: string,
  context: PredictionContext,
): Checked<Prediction[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(outputText) as unknown;
  } catch {
    return { ok: false, issues: [issue("schema", "$", "Output is not JSON.")] };
  }
  const parsed = ProposePredictions.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => issue("schema", jsonPath(i.path), i.message)),
    };
  }
  const { predictions } = parsed.data;
  const outside = scopeIssues(
    predictions.map((p, i) => [`$.predictions[${String(i)}].wording`, p.wording] as const),
  );
  if (outside.length > 0) return { ok: false, issues: outside, failureCode: OUT_OF_SCOPE };

  const issues: ValidationIssue[] = [];
  if (predictions.length < PREDICTION_LIMITS.min || predictions.length > PREDICTION_LIMITS.max) {
    issues.push(
      issue(
        "limit",
        "$.predictions",
        `Give ${String(PREDICTION_LIMITS.min)} to ${String(PREDICTION_LIMITS.max)} predictions.`,
      ),
    );
  }
  const allowedNumbers = [...new Set(context.catalog.pairs.flatMap((p) => p.windowsMonths))];
  const seen = new Map<string, number>();
  predictions.forEach((p, i) => {
    const at = `$.predictions[${String(i)}]`;
    const test = p.test;
    const grammar = GRAMMAR[test.kind];
    for (const field of FIELDS) {
      const wanted = grammar.fields.includes(field);
      if (wanted && !isSet(test, field)) {
        issues.push(issue("schema", `${at}.test.${field}`, `${test.kind} needs ${field}.`));
      }
      if (!wanted && isSet(test, field)) {
        issues.push(
          issue(
            "schema",
            `${at}.test.${field}`,
            `${test.kind} does not use ${field}; set it to ${field === "periodIds" ? "[]" : "null"}.`,
          ),
        );
      }
    }
    if (
      grammar.expected === null
        ? test.expected !== null
        : !grammar.expected.includes(test.expected ?? "")
    ) {
      issues.push(
        issue(
          "schema",
          `${at}.test.expected`,
          grammar.expected === null
            ? `${test.kind} expects null.`
            : `${test.kind} expects ${grammar.expected.join(" or ")}.`,
        ),
      );
    }
    if (test.periodIds.length > PREDICTION_LIMITS.maxPeriods) {
      issues.push(
        issue(
          "limit",
          `${at}.test.periodIds`,
          `At most ${String(PREDICTION_LIMITS.maxPeriods)} periods.`,
        ),
      );
    }
    if (new Set(test.periodIds).size !== test.periodIds.length) {
      issues.push(issue("schema", `${at}.test.periodIds`, "A period is named twice."));
    }
    issues.push(...targetIssues(test, context.catalog, at));
    const key = testKey(test);
    const first = seen.get(key);
    if (first !== undefined) {
      issues.push(
        issue("limit", `${at}.test`, `Prediction ${String(first + 1)} already tests this.`),
      );
    } else {
      seen.set(key, i);
    }
    issues.push(...wordingIssues(p.wording, `${at}.wording`, allowedNumbers, context.years));
  });
  if (!predictions.some((p) => p.necessary)) {
    issues.push(issue("claim_kind", "$.predictions", "Mark at least one prediction necessary."));
  }
  if (!predictions.some((p) => p.test.kind !== "field_check")) {
    issues.push(
      issue(
        "claim_kind",
        "$.predictions",
        "At least one prediction must test the record, not the field.",
      ),
    );
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: predictions.map((p, i) => ({
      key: `p${String(i + 1)}`,
      necessary: p.necessary,
      test: p.test,
      wording: p.wording.trim(),
    })),
    issues: [],
  };
}
