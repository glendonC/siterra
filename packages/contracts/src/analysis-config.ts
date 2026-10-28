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
  /** The method of the validated bundle that holds this side; found from bundle metadata alone. */
  methodId: z.string().min(1),
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
  /** Fewer aligned months than this leave a co-movement prediction not testable (inadequate data). */
  minAlignedMonths: z.int().min(1),
});
export type SeriesPair = z.infer<typeof SeriesPair>;

/** Two configured explanation IDs, in either order, that one field check can tell apart. */
export const ExplanationPairIds = z.tuple([configKey, configKey]);

const pairKey = ([a, b]: readonly [string, string]) => [a, b].sort().join("|");

/**
 * A measurement the record cannot make; a prediction about it is never testable from the record.
 * `separates` is a configured judgment about which explanation pairs its result tells apart
 * (reviewed for the valley in docs/explanation/scientific-basis.md and research/science/analytics.md);
 * the field plan (DF-09) chooses from these, and nothing reads a check's wording.
 */
export const FieldCheck = z.strictObject({
  id: configKey,
  label,
  method: text({ min: 1, max: 300 }),
  /** Where the judgment comes from: a repository document anchor or a source ID. */
  basis: text({ min: 1, max: 200 }),
  separates: z
    .array(ExplanationPairIds)
    .min(1)
    .refine((pairs) => pairs.every(([a, b]) => a !== b), {
      error: "A field check separates two different explanations",
    })
    .refine(uniqueBy(pairKey), { error: "A field check names each pair once" }),
});
export type FieldCheck = z.infer<typeof FieldCheck>;

/** The rainfall season events are compared with, and the recipe that summarizes it. */
export const SeasonWindow = z.strictObject({
  id: configKey,
  label,
  startMonth: month,
  endMonth: month,
  recipe: z.strictObject({ recipeId: z.string().min(1), version: z.string().min(1) }),
});
export type SeasonWindow = z.infer<typeof SeasonWindow>;

/** Long-record trend summary recipe and the stratum IDs it evaluates. */
export const TrendSummaryConfig = z.strictObject({
  recipe: z.strictObject({ recipeId: z.string().min(1), version: z.string().min(1) }),
  strata: uniqueArray(configKey).min(1),
});
export type TrendSummaryConfig = z.infer<typeof TrendSummaryConfig>;

/** A candidate explanation, in host-written words; the command tests it as one branch. */
export const ExplanationDefinition = z.strictObject({
  id: configKey,
  label,
  statement: text({ min: 1, max: 400 }),
});
export type ExplanationDefinition = z.infer<typeof ExplanationDefinition>;

export const CaseAnalysisConfig = z
  .strictObject({
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
    fieldChecks: z.array(FieldCheck).refine(
      uniqueBy((c: FieldCheck) => c.id),
      { error: "Field check IDs must be unique" },
    ),
    /**
     * Status of a branch under merge@2 when every necessary prediction is met and an optional
     * testable prediction is not met. Defaults to "cannot_be_assessed" when omitted.
     */
    whenOptionalNotMet: z.enum(["cannot_be_assessed", "consistent"]).optional(),
    /** Optional long-record trend summary recipe and its stratum IDs for trend_direction tests. */
    trendSummary: TrendSummaryConfig.optional(),
  })
  .refine(
    (config) => {
      const ids = new Set(config.explanations.map((e) => e.id));
      return config.fieldChecks.every((c) => c.separates.flat().every((id) => ids.has(id)));
    },
    { error: "A field check separates only configured explanations", path: ["fieldChecks"] },
  );
export type CaseAnalysisConfig = z.infer<typeof CaseAnalysisConfig>;
