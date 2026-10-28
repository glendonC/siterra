import { z } from "zod";

import type { MeasurementRecord } from "../tasks/records.ts";
import type { CaseStore } from "./store.ts";
import { ToolFailure } from "./tool.ts";
import type { ToolHandler } from "./tool.ts";
import { argumentSchema, parseWith } from "./zod-tool.ts";

// compare_series, read_evidence, list_recipes and read_recipe_result
// (docs/reference/agent-orchestration.md#tools-and-permissions, docs/reference/analysis-recipes.md).
// Code only aligns, sums at stored precision, counts and looks up; every value returned comes from
// a stored measurement or a stored recipe result. No causal statistics, no fitted attribution.

/** The prespecified antecedent windows, in months (aligned_antecedent 1.1.1); never a model choice. */
export const WINDOWS = [0, 1, 2, 3] as const;

const MAX_EVIDENCE = 20;

const SeriesRef = z.strictObject({
  bundleId: z.string(),
  bundleRevision: z.number(),
  metric: z.string(),
});
const CompareArgs = z.strictObject({ a: SeriesRef, b: SeriesRef });
type CompareArgs = z.infer<typeof CompareArgs>;
type SeriesRef = z.infer<typeof SeriesRef>;

/**
 * The series compare_series may align: the departures the aligned_antecedent recipe names (AUDIT
 * a56). Raw values are refused: always-positive series make every month "move together".
 */
export const VEGETATION_DEPARTURES: ReadonlySet<string> = new Set([
  "ndvi_departure_area_median",
  "ndvi_departure_area_median_leave_one_year_out",
]);
export const RAINFALL_DEPARTURES: ReadonlySet<string> = new Set([
  "precipitation_departure_from_1991_2020_mean",
]);

/** Rainfall sums are compared as stored at two decimals (aligned_antecedent 1.1.1 zero rule). */
const RAINFALL_DECIMALS = 2;

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** The month before a period ID ("period_2022-01" gives "period_2021-12"). */
export function previousPeriod(periodId: string): string | null {
  const m = /^period_(\d{4})-(\d{2})$/.exec(periodId);
  if (!m?.[1] || !m[2]) return null;
  let year = Number(m[1]);
  let month = Number(m[2]) - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `period_${String(year)}-${String(month).padStart(2, "0")}`;
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

async function series(
  store: CaseStore,
  caseId: string,
  ref: SeriesRef,
): Promise<MeasurementRecord[]> {
  const bundle = await store.readBundle(caseId, ref.bundleId);
  if (!bundle) throw new ToolFailure("unknown_bundle", `no bundle ${ref.bundleId} in this case`);
  if (bundle.status !== "validated") {
    throw new ToolFailure("bundle_not_validated", `bundle ${bundle.id} is ${bundle.status}`);
  }
  if (bundle.revision !== ref.bundleRevision) {
    throw new ToolFailure(
      "stale_reference",
      `bundle ${bundle.id} is at revision ${bundle.revision}, not ${ref.bundleRevision}`,
    );
  }
  const rows = (
    await store.readMeasurements(caseId, bundle.id, bundle.revision, bundle.periodIds)
  ).filter((m) => m.metric === ref.metric);
  if (rows.length === 0)
    throw new ToolFailure("unknown_metric", `bundle ${bundle.id} has no ${ref.metric} values`);
  return rows;
}

export function compareSeriesTool(store: CaseStore, caseId: string): ToolHandler<CompareArgs> {
  return {
    name: "compare_series",
    description:
      "Align a vegetation departure series (a) with the rainfall departure series (b) on shared period IDs and the same area revision; other series are refused. Series a is compared month by month with series b summed over the prespecified antecedent windows of 0 to 3 months (b of the month and the months before it). Returns the aligned rows and, per window, the months aligned and the months with the same sign; a stored value of 0 has no sign and is left out. Co-occurrence only: no causal statistic.",
    parameters: argumentSchema(CompareArgs),
    parse: (args) => {
      const parsed = parseWith(CompareArgs, args);
      if (!parsed.ok) return parsed;
      for (const key of ["a", "b"] as const) {
        const r = parsed.value[key].bundleRevision;
        if (!Number.isInteger(r) || r < 1)
          return { ok: false, message: `$.${key}.bundleRevision: must be a positive integer` };
      }
      return parsed;
    },
    summarize: (args) =>
      `${args.a.bundleId} ${args.a.metric} against ${args.b.bundleId} ${args.b.metric}`,
    datasetIds: (args) => [args.a.bundleId, args.b.bundleId],
    run: async (args) => {
      if (!VEGETATION_DEPARTURES.has(args.a.metric)) {
        throw new ToolFailure(
          "not_a_departure_series",
          `series a must be a vegetation departure (${[...VEGETATION_DEPARTURES].join(", ")}), not ${args.a.metric}`,
        );
      }
      if (!RAINFALL_DEPARTURES.has(args.b.metric)) {
        throw new ToolFailure(
          "not_a_departure_series",
          `series b must be a rainfall departure (${[...RAINFALL_DEPARTURES].join(", ")}), not ${args.b.metric}`,
        );
      }
      const a = await series(store, caseId, args.a);
      const b = await series(store, caseId, args.b);
      const geoA = new Set(a.map((m) => `${m.geoSelectionId}@${String(m.geoRevision)}`));
      const geoB = new Set(b.map((m) => `${m.geoSelectionId}@${String(m.geoRevision)}`));
      if (geoA.size !== 1 || geoB.size !== 1 || [...geoA][0] !== [...geoB][0]) {
        throw new ToolFailure(
          "area_mismatch",
          "the two series are not on the same geometry revision",
        );
      }
      const bByPeriod = new Map(b.map((m) => [m.periodId, m]));
      const bValue = (periodId: string | null): number | null => {
        const m = periodId === null ? undefined : bByPeriod.get(periodId);
        return m?.status === "available" && m.value !== null ? m.value : null;
      };
      const counts = Object.fromEntries(
        WINDOWS.map((k) => [String(k), { alignedMonths: 0, sameSignMonths: 0 }]),
      ) as Record<string, { alignedMonths: number; sameSignMonths: number }>;
      const rows = [...a]
        .sort((x, y) => x.periodId.localeCompare(y.periodId))
        .filter((m) => bByPeriod.has(m.periodId))
        .map((m) => {
          const av = m.status === "available" ? m.value : null;
          const windows: Record<string, number | null> = {};
          for (const k of WINDOWS) {
            let period: string | null = m.periodId;
            const parts: number[] = [];
            for (let i = 0; i <= k && period !== null; i += 1) {
              const v = bValue(period);
              if (v === null) break;
              parts.push(v);
              period = previousPeriod(period);
            }
            const sum =
              parts.length === k + 1
                ? roundTo(
                    parts.reduce((s, v) => s + v, 0),
                    RAINFALL_DECIMALS,
                  )
                : null;
            windows[String(k)] = sum;
            const c = counts[String(k)];
            if (c && av !== null && sum !== null && av !== 0 && sum !== 0) {
              c.alignedMonths += 1;
              if (sign(av) === sign(sum)) c.sameSignMonths += 1;
            }
          }
          return {
            periodId: m.periodId,
            a: { measurementId: m.id, value: av },
            b: { measurementId: bByPeriod.get(m.periodId)?.id ?? null, windows },
          };
        });
      return {
        output: {
          a: args.a,
          b: args.b,
          windowsMonths: WINDOWS,
          zeroRule: "A value of 0 as stored has no sign and is left out of both counts.",
          counts,
          rows,
          limitations: [
            "Counting months that move together shows co-occurrence; it does not estimate how much of a change one series explains.",
            "A short record can hold months that move together by chance.",
          ],
        },
        resultEntityIds: rows.flatMap((r) => [
          r.a.measurementId,
          ...(r.b.measurementId ? [r.b.measurementId] : []),
        ]),
      };
    },
  };
}

const ReadEvidenceArgs = z.strictObject({ evidenceIds: z.array(z.string()) });
type ReadEvidenceArgs = z.infer<typeof ReadEvidenceArgs>;

export function readEvidenceTool(store: CaseStore, caseId: string): ToolHandler<ReadEvidenceArgs> {
  return {
    name: "read_evidence",
    description: `Read accepted evidence records of this case by ID (up to ${MAX_EVIDENCE}): statement, claim kind, revision, cited measurements and source locators.`,
    parameters: argumentSchema(ReadEvidenceArgs),
    parse: (args) => {
      const parsed = parseWith(ReadEvidenceArgs, args);
      if (
        parsed.ok &&
        (parsed.value.evidenceIds.length === 0 || parsed.value.evidenceIds.length > MAX_EVIDENCE)
      ) {
        return { ok: false, message: `$.evidenceIds: give 1 to ${MAX_EVIDENCE} IDs` };
      }
      return parsed;
    },
    summarize: (args) =>
      `${args.evidenceIds.length} evidence ${args.evidenceIds.length === 1 ? "record" : "records"}`,
    run: async (args) => {
      const found = await store.readEvidence(caseId, [...new Set(args.evidenceIds)]);
      const records = found.map((e) => ({
        evidenceId: e.id,
        revision: e.revision,
        status: e.status,
        claimKind: e.claimKind,
        statement: e.statement,
        periodIds: e.periodIds,
        measurementIds: e.measurementIds,
        sourceLocators: e.provenance.sourceLocators,
        limitations: e.provenance.limitations,
      }));
      const known = new Set(found.map((e) => e.id));
      return {
        output: { records, unknown: args.evidenceIds.filter((id) => !known.has(id)) },
        resultEntityIds: found.map((e) => e.id),
      };
    },
  };
}

const ListRecipesArgs = z.strictObject({});
type ListRecipesArgs = z.infer<typeof ListRecipesArgs>;

export function listRecipesTool(store: CaseStore, caseId: string): ToolHandler<ListRecipesArgs> {
  return {
    name: "list_recipes",
    description:
      "List the analysis recipes with their applicability in this case. A recipe applies when a validated bundle holds its precomputed result; otherwise it is returned as blocked with the reason, and cannot be used.",
    parameters: argumentSchema(ListRecipesArgs),
    parse: (args) => parseWith(ListRecipesArgs, args),
    summarize: () => "recipe catalog",
    run: async () => {
      const recipes = await store.listRecipes(caseId);
      const bundles = await store.listBundles(caseId);
      const rows = recipes.map((r) => {
        const bundle = bundles.find(
          (b) =>
            b.methodId === r.recipeId && b.methodVersion === r.version && b.status === "validated",
        );
        const otherVersion = bundles.find(
          (b) => b.methodId === r.recipeId && b.status === "validated",
        );
        let blockedReason: string | null = null;
        if (!bundle) {
          blockedReason = otherVersion
            ? `The case holds version ${otherVersion.methodVersion}, not ${r.version}.`
            : "No validated precomputed result for this recipe in this case.";
        }
        return {
          recipeId: r.recipeId,
          version: r.version,
          title: r.title,
          question: r.question,
          status: bundle ? "applicable" : "blocked",
          blockedReason,
          bundleId: bundle?.id ?? null,
          bundleRevision: bundle?.revision ?? null,
          outputs: r.outputs,
        };
      });
      return {
        output: { recipes: rows },
        resultEntityIds: rows.flatMap((r) => (r.bundleId ? [r.bundleId] : [])),
      };
    },
  };
}

const ReadRecipeArgs = z.strictObject({
  recipeId: z.string(),
  version: z.string(),
  bundleId: z.string(),
});
type ReadRecipeArgs = z.infer<typeof ReadRecipeArgs>;

export function readRecipeResultTool(
  store: CaseStore,
  caseId: string,
): ToolHandler<ReadRecipeArgs> {
  return {
    name: "read_recipe_result",
    description:
      "Read a precomputed recipe result by recipe, version and bundle, as list_recipes names them. The result is labelled precomputed analysis and comes with the recipe's standard limitations, to be quoted as they are.",
    parameters: argumentSchema(ReadRecipeArgs),
    parse: (args) => parseWith(ReadRecipeArgs, args),
    summarize: (args) => `${args.recipeId} ${args.version} from ${args.bundleId}`,
    datasetIds: (args) => [args.bundleId],
    run: async (args) => {
      const bundle = await store.readBundle(caseId, args.bundleId);
      if (bundle?.status !== "validated") {
        throw new ToolFailure(
          "bundle_not_validated",
          `no validated bundle ${args.bundleId} in this case`,
        );
      }
      if (bundle.methodId !== args.recipeId || bundle.methodVersion !== args.version) {
        throw new ToolFailure(
          "recipe_mismatch",
          `bundle ${bundle.id} holds ${bundle.methodId} ${bundle.methodVersion}, not ${args.recipeId} ${args.version}`,
        );
      }
      const stored = await store.readRecipeResult(caseId, bundle.id);
      if (!stored) throw new ToolFailure("no_result", `bundle ${bundle.id} holds no stored result`);
      const entry = (await store.listRecipes(caseId)).find(
        (r) => r.recipeId === args.recipeId && r.version === args.version,
      );
      return {
        output: {
          label: "precomputed analysis",
          recipeId: args.recipeId,
          version: args.version,
          bundleId: bundle.id,
          bundleRevision: bundle.revision,
          standardLimitations: entry?.standardLimitations ?? [],
          result: stored.result,
        },
        resultEntityIds: [bundle.id],
      };
    },
  };
}
