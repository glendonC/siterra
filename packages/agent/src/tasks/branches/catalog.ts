import type { CaseAnalysisConfig, FieldCheck, SeasonWindow } from "@siterra/contracts";
import { QualityFlag } from "@siterra/contracts";

import { seasonFor } from "../../tools/event-tools.ts";
import type { CaseStore } from "../../tools/store.ts";
import type { DataBundleRecord } from "../records.ts";

// What a prediction may name, built from the case configuration and bundle metadata alone: pair
// and side IDs, the period IDs a bundle covers, season IDs and flag names. No measurement, quality
// record or recipe result is read here, so the model writes its predictions without seeing any.

export interface SideCatalog {
  label: string;
  metrics: readonly string[];
  /** The validated bundle of the side's configured method, or null when the case has none. */
  bundle: { id: string; revision: number } | null;
  periodIds: readonly string[];
}

export interface PairCatalog {
  pairId: string;
  a: SideCatalog;
  b: SideCatalog;
  windowsMonths: readonly number[];
  minAlignedMonths: number;
}

export interface BranchCatalog {
  pairs: readonly PairCatalog[];
  seasonIds: readonly string[];
  trendStrata: readonly string[];
  qualityFlags: readonly string[];
  fieldChecks: readonly FieldCheck[];
  /** Each configured input the case has no validated bundle for, named as a blocked input. */
  gaps: readonly string[];
}

function inWindow(month: number, season: Pick<SeasonWindow, "startMonth" | "endMonth">): boolean {
  return season.startMonth <= season.endMonth
    ? month >= season.startMonth && month <= season.endMonth
    : month >= season.startMonth || month <= season.endMonth;
}

const PERIOD = /^period_(\d{4})-(\d{2})$/;

/** Seasons of the configured window whose every month the given periods cover. */
export function coveredSeasons(
  periodIds: readonly string[],
  season: Pick<SeasonWindow, "startMonth" | "endMonth">,
): string[] {
  const months = new Map<string, Set<string>>();
  for (const id of new Set(periodIds)) {
    const m = PERIOD.exec(id);
    if (!m?.[1] || !m[2] || !inWindow(Number(m[2]), season)) continue;
    const seasonId = seasonFor(`${m[1]}-${m[2]}`, season);
    if (seasonId === null) continue;
    months.set(seasonId, (months.get(seasonId) ?? new Set()).add(id));
  }
  const length =
    season.startMonth <= season.endMonth
      ? season.endMonth - season.startMonth + 1
      : 12 - season.startMonth + 1 + season.endMonth;
  return [...months]
    .filter(([, ids]) => ids.size === length)
    .map(([id]) => id)
    .sort();
}

function sideBundle(
  bundles: readonly DataBundleRecord[],
  methodId: string,
): DataBundleRecord | null {
  return (
    bundles
      .filter((b) => b.status === "validated" && b.methodId === methodId)
      .sort((x, y) => x.id.localeCompare(y.id))[0] ?? null
  );
}

export async function buildCatalog(
  store: CaseStore,
  caseId: string,
  config: CaseAnalysisConfig,
): Promise<BranchCatalog> {
  const bundles = await store.listBundles(caseId);
  const side = (s: CaseAnalysisConfig["seriesPairs"][number]["a"]): SideCatalog => {
    const bundle = sideBundle(bundles, s.methodId);
    return {
      label: s.label,
      metrics: s.metrics,
      bundle: bundle ? { id: bundle.id, revision: bundle.revision } : null,
      periodIds: bundle ? [...bundle.periodIds].sort() : [],
    };
  };
  const pairs = config.seriesPairs.map((p) => ({
    pairId: p.id,
    a: side(p.a),
    b: side(p.b),
    windowsMonths: p.windowsMonths,
    minAlignedMonths: p.minAlignedMonths,
  }));
  const gaps = config.seriesPairs.flatMap((p, i) =>
    (["a", "b"] as const).flatMap((s) =>
      pairs[i]?.[s].bundle
        ? []
        : [`${p[s].label} (${p.id} side ${s}): no validated ${p[s].methodId} bundle in this case.`],
    ),
  );
  const { recipe } = config.rainfallSeason;
  const hasSeasons = bundles.some(
    (b) =>
      b.status === "validated" &&
      b.methodId === recipe.recipeId &&
      b.methodVersion === recipe.version,
  );
  if (!hasSeasons) {
    gaps.push(
      `${config.rainfallSeason.label}: no validated ${recipe.recipeId} ${recipe.version} result in this case.`,
    );
  }
  const trendRecipe = config.trendSummary?.recipe;
  const hasTrends =
    trendRecipe !== undefined &&
    bundles.some(
      (b) =>
        b.status === "validated" &&
        b.methodId === trendRecipe.recipeId &&
        b.methodVersion === trendRecipe.version,
    );
  return {
    pairs,
    seasonIds: hasSeasons
      ? coveredSeasons(
          pairs.flatMap((p) => [...p.a.periodIds, ...p.b.periodIds]),
          config.rainfallSeason,
        )
      : [],
    trendStrata: hasTrends ? (config.trendSummary?.strata ?? []) : [],
    qualityFlags: QualityFlag.options,
    fieldChecks: config.fieldChecks,
    gaps,
  };
}

/** The catalog as the model reads it: IDs and labels, period ranges, never a value. */
export function catalogView(catalog: BranchCatalog): unknown {
  const range = (s: SideCatalog) =>
    s.periodIds.length === 0
      ? { label: s.label, periods: null }
      : {
          label: s.label,
          periods: { first: s.periodIds[0], last: s.periodIds.at(-1), count: s.periodIds.length },
        };
  return {
    pairs: catalog.pairs.map((p) => ({
      pairId: p.pairId,
      a: range(p.a),
      b: range(p.b),
      windowsMonths: p.windowsMonths,
    })),
    seasonIds: catalog.seasonIds,
    trendStrata: catalog.trendStrata,
    qualityFlags: catalog.qualityFlags,
    fieldChecks: catalog.fieldChecks.map((c) => ({ id: c.id, label: c.label })),
  };
}
