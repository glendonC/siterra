import { z } from "zod";

import { entityId, text, uniqueArray } from "./primitives.ts";

// The case analysis configuration: what is specific to one place, so that a new place is a new
// configuration and not new code. It names the series pairs compare_series may align, the rainfall
// season compare_events maps events to, and the candidate explanations a command tests. Host code
// reads it; the model never writes it.

export const analysisConfigVersion = 1;

/** At most this many explanations are tested in one command (one branch each). */
export const maxExplanations = 5;

const configKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const month = z.int().min(1).max(12);
const label = text({ min: 1, max: 120 });

function uniqueBy<T>(key: (item: T) => string) {
  return (items: readonly T[]) => new Set(items.map(key)).size === items.length;
}

const SeriesSide = z.strictObject({
  label,
  /** Measurement metrics this side may be; a metric outside the list is refused. */
  metrics: uniqueArray(z.string().min(1)).min(1),
});

/** A pair of series compare_series may align: a month by month against b summed over windows. */
export const SeriesPair = z.strictObject({
  id: configKey,
  a: SeriesSide,
  b: SeriesSide.extend({
    /** The decimals b is stored at; window sums are rounded to them (the zero rule). */
    storedDecimals: z.int().min(0).max(6),
  }),
  /** Antecedent windows in months, fixed before any data is read; never a model choice. */
  windowsMonths: uniqueArray(z.int().min(0).max(12)).min(1),
});
export type SeriesPair = z.infer<typeof SeriesPair>;

/** The rainfall season events are compared with, and the recipe that summarizes it. */
export const SeasonWindow = z.strictObject({
  id: configKey,
  label,
  startMonth: month,
  endMonth: month,
  recipe: z.strictObject({ recipeId: z.string().min(1), version: z.string().min(1) }),
});
export type SeasonWindow = z.infer<typeof SeasonWindow>;

/** A candidate explanation, in host-written words; the command tests it as one branch. */
export const ExplanationDefinition = z.strictObject({
  id: configKey,
  label,
  statement: text({ min: 1, max: 400 }),
});
export type ExplanationDefinition = z.infer<typeof ExplanationDefinition>;

export const CaseAnalysisConfig = z.strictObject({
  configVersion: z.literal(analysisConfigVersion),
  caseId: entityId,
  /** How tool descriptions and host messages name the case area, such as "catchment". */
  areaLabel: label,
  seriesPairs: z
    .array(SeriesPair)
    .min(1)
    .refine(
      uniqueBy((p: SeriesPair) => p.id),
      { error: "Series pair IDs must be unique" },
    ),
  rainfallSeason: SeasonWindow,
  explanations: z
    .array(ExplanationDefinition)
    .min(1)
    .max(maxExplanations)
    .refine(
      uniqueBy((e: ExplanationDefinition) => e.id),
      { error: "Explanation IDs must be unique" },
    ),
});
export type CaseAnalysisConfig = z.infer<typeof CaseAnalysisConfig>;
