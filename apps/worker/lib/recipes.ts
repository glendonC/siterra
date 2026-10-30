import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { DataBundleRecord, RecipeEntry, RecipeResult } from "@siterra/agent";

// The recipe registry (science/recipes/registry.json) and each recipe bundle's stored result (the
// data asset of data/bundles/<bundle>/collection.json). Results are read as stored; the worker
// computes nothing from them.

export interface Analyses {
  recipes: RecipeEntry[];
  results: RecipeResult[];
  /** The registry path or recipe bundles whose JSON result file could not be read. */
  missing: string[];
}

interface Registry {
  recipes: RecipeEntry[];
}

interface Collection {
  assets?: Record<string, { href?: string; roles?: string[]; type?: string }>;
}

/**
 * What read_recipe_result returns for a recipe bundle whose result is not one JSON file: per-period
 * measurements (monthly_departure) or map layers (terrain_strata). The pointer is written by code.
 */
function pointerFor(bundle: DataBundleRecord, layerType: string | null): unknown {
  if (bundle.periodIds.length > 0) {
    return {
      kind: "per_period_measurements",
      note: `This recipe's results are the bundle's per-period measurements; read them with summarize_observations on ${bundle.id}.`,
    };
  }
  return {
    kind: "map_layers",
    note: `This recipe's result is a map layer${layerType ? ` (${layerType})` : ""}; it has no tabular values.`,
  };
}

export async function loadAnalyses(
  repoRoot: string,
  bundles: readonly DataBundleRecord[],
  registryPath = "science/recipes/registry.json",
): Promise<Analyses> {
  let registry: Registry;
  try {
    registry = JSON.parse(await readFile(join(repoRoot, registryPath), "utf8")) as Registry;
  } catch {
    // No registry: list_recipes then lists nothing, and the gap is reported, not hidden.
    return { recipes: [], results: [], missing: [registryPath] };
  }
  const recipes = registry.recipes.map((r) => ({
    recipeId: r.recipeId,
    version: r.version,
    title: r.title,
    question: r.question,
    outputs: r.outputs,
    standardLimitations: r.standardLimitations,
    priority: r.priority,
  }));
  const known = new Set(recipes.map((r) => r.recipeId));
  const results: RecipeResult[] = [];
  const missing: string[] = [];
  for (const bundle of bundles) {
    if (bundle.status !== "validated" || !known.has(bundle.methodId)) continue;
    try {
      const dir = join(repoRoot, "data/bundles", bundle.id);
      const collection = JSON.parse(
        await readFile(join(dir, "collection.json"), "utf8"),
      ) as Collection;
      const named = collection.assets?.[bundle.methodId];
      const assets = [...(named ? [named] : []), ...Object.values(collection.assets ?? {})].filter(
        (a) => a.roles?.includes("data"),
      );
      // The result is the recipe's own data asset: the one named for it, else the first data asset.
      // A bundle whose first data asset is a raster is a map-layer bundle, even when it also lists
      // a JSON header for a web-ready copy of that raster.
      const first = assets[0];
      const data =
        first && (first.href?.endsWith(".json") || first.type === "application/json")
          ? first
          : undefined;
      if (!data?.href) {
        const pointer = pointerFor(bundle, assets[0]?.type ?? null);
        results.push({
          bundleId: bundle.id,
          recipeId: bundle.methodId,
          version: bundle.methodVersion,
          result: pointer,
        });
        continue;
      }
      const result = JSON.parse(await readFile(join(dir, data.href), "utf8")) as unknown;
      results.push({
        bundleId: bundle.id,
        recipeId: bundle.methodId,
        version: bundle.methodVersion,
        result,
      });
    } catch {
      missing.push(bundle.id);
    }
  }
  return { recipes, results, missing };
}
