import type { ToolCallInfo, ToolCallTarget } from "./case.ts";

const ENTITY_ID_PATTERN = /^[a-z][a-z0-9_]*_[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;

const BUNDLE_RECIPE_PREFIXES: readonly [string, string][] = [
  ["bundle_aligned_antecedent", "aligned_antecedent"],
  ["bundle_coverage_summary", "coverage_summary"],
  ["bundle_drainage_network", "drainage_network"],
  ["bundle_land_cover", "land_cover_classes"],
  ["bundle_ndvi_departure", "monthly_departure"],
  ["bundle_optical_visibility", "optical_visibility_by_band"],
  ["bundle_pixel_anatomy", "pixel_anatomy"],
  ["bundle_pixel_seasons", "pixel_seasons"],
  ["bundle_pixel_trend_long_record", "pixel_trend_long_record"],
  ["bundle_proposed_routes", "proposed_routes"],
  ["bundle_relief", "terrain_relief"],
  ["bundle_restrend_long_record", "restrend_long_record"],
  ["bundle_season_summary", "season_summary"],
  ["bundle_season_trend_long_record", "season_trend_long_record"],
  ["bundle_snow_cover_by_band", "snow_cover_by_band"],
  ["bundle_species_occurrences", "species_occurrences"],
  ["bundle_terrain_strata", "terrain_strata"],
  ["bundle_transects", "terrain_transects"],
];

const KNOWN_RECIPE_IDS = [
  "coverage_summary",
  "monthly_departure",
  "aligned_antecedent",
  "season_summary",
  "terrain_strata",
  "restrend_long_record",
  "snow_cover_by_band",
  "pixel_trend_long_record",
  "pixel_seasons",
  "species_occurrences",
  "season_trend_long_record",
  "drainage_network",
  "terrain_transects",
  "pixel_anatomy",
  "terrain_relief",
  "land_cover_classes",
  "optical_visibility_by_band",
  "proposed_routes",
] as const;

export function asEntityId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return ENTITY_ID_PATTERN.test(value) ? value : null;
}

export function firstEntityWithPrefix(ids: readonly string[], prefix: string): string | null {
  for (const id of ids) {
    if (id.startsWith(prefix) && ENTITY_ID_PATTERN.test(id)) {
      return id;
    }
  }
  return null;
}

function extractEntityWithPrefix(text: string, prefix: string): string | null {
  const match = new RegExp(`\\b(${prefix}[A-Za-z0-9_-]{1,79})\\b`).exec(text);
  return asEntityId(match?.[1]);
}

export function inferStratumFromText(text: string): string | null {
  if (text.includes("valley_floor")) return "valley_floor";
  if (text.includes("mid_slope")) return "mid_slope";
  if (text.includes("upper_basin")) return "upper_basin";
  if (text.includes("water_zone")) return "water_zone";
  if (text.includes("catchment")) return "catchment";
  return null;
}

export function inferRecipeFromBundleId(bundleId: string): string | null {
  for (const [prefix, recipeId] of BUNDLE_RECIPE_PREFIXES) {
    if (bundleId.startsWith(prefix)) return recipeId;
  }
  for (const recipeId of KNOWN_RECIPE_IDS) {
    if (bundleId.includes(recipeId)) return recipeId;
  }
  return null;
}

export function enrichToolCallTarget(
  target: ToolCallTarget | null,
  resultEntityIds: readonly string[],
): ToolCallTarget | null {
  if (target === null || resultEntityIds.length === 0) return target;
  let sourceId = target.sourceId;
  let bundleId = target.bundleId;
  let recipeId = target.recipeId;
  if (target.kind === "source" && sourceId === null) {
    sourceId = firstEntityWithPrefix(resultEntityIds, "src_");
  }
  if ((target.kind === "bundle" || target.kind === "land") && bundleId === null) {
    bundleId = firstEntityWithPrefix(resultEntityIds, "bundle_");
    if (recipeId === null && bundleId !== null) {
      recipeId = inferRecipeFromBundleId(bundleId);
    }
  }
  if (
    sourceId === target.sourceId &&
    bundleId === target.bundleId &&
    recipeId === target.recipeId
  ) {
    return target;
  }
  return {
    ...target,
    sourceId,
    bundleId,
    recipeId,
  };
}

function parsePagesFromSummary(summary: string): number[] {
  const pages: number[] = [];
  const matches = summary.matchAll(/\b(?:pages?|p\.)\s*(\d+(?:\s*,\s*\d+)*)/gi);
  for (const match of matches) {
    const group = match[1];
    if (!group) continue;
    for (const part of group.split(",")) {
      const n = Number.parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n >= 1 && !pages.includes(n)) {
        pages.push(n);
      }
    }
  }
  return pages;
}

function parseSectionsFromSummary(summary: string): string[] {
  const match = /\bsections?\s+([A-Za-z0-9_.-]+(?:\s*,\s*[A-Za-z0-9_.-]+)*)/i.exec(summary);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 1);
}

function parseSearchTermsFromSummary(summary: string): string[] {
  if (/^query of \d+ terms?$/i.test(summary.trim())) {
    return [];
  }
  const match = /^(?:query|search)\s*:\s*(.+)$/i.exec(summary.trim());
  if (!match?.[1]) return [];
  return match[1]
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((term) => term.length >= 2);
}

function parseOccurrenceTermsFromSummary(summary: string): string[] {
  const match = /^occurrences matching (.+),\s*(.+),\s*at most \d+$/i.exec(summary.trim());
  if (!match) return [];
  return [match[1], match[2]]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0 && part !== "any name" && part !== "any group");
}

/**
 * Resolves a structured ToolCallTarget for the Phase 2 AI View (Agent Tree, Agent Cursors, and
 * Thinking State). Returns `tool.target` directly when present, and otherwise deterministically
 * derives a target from `tool.name`, `tool.argumentSummary`, and `tool.resultEntityIds`.
 */
export function resolveToolCallTarget(tool: ToolCallInfo): ToolCallTarget | null {
  if (tool.target !== undefined && tool.target !== null) {
    return tool.target;
  }
  if (tool.argumentSummary === "Arguments did not validate." && tool.resultEntityIds.length === 0) {
    return null;
  }

  switch (tool.name) {
    case "read_source":
    case "fetch_source": {
      const sourceId =
        extractEntityWithPrefix(tool.argumentSummary, "src_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "src_");
      return {
        kind: "source",
        stratumId: null,
        bundleId: null,
        recipeId: null,
        sourceId,
        pages: parsePagesFromSummary(tool.argumentSummary),
        sections: parseSectionsFromSummary(tool.argumentSummary),
        queryTerms: [],
      };
    }

    case "search_sources": {
      const sourceId =
        firstEntityWithPrefix(tool.resultEntityIds, "src_") ??
        extractEntityWithPrefix(tool.argumentSummary, "src_");
      return {
        kind: "source",
        stratumId: null,
        bundleId: null,
        recipeId: null,
        sourceId,
        pages: [],
        sections: [],
        queryTerms: parseSearchTermsFromSummary(tool.argumentSummary),
      };
    }

    case "read_recipe_result": {
      const recipeMatch = /^([a-z][a-z0-9_]*)\s+\S+\s+from\s+(bundle_[A-Za-z0-9_-]+)/.exec(
        tool.argumentSummary.trim(),
      );
      const bundleId =
        asEntityId(recipeMatch?.[2]) ??
        extractEntityWithPrefix(tool.argumentSummary, "bundle_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      const recipeId =
        recipeMatch?.[1] ?? (bundleId !== null ? inferRecipeFromBundleId(bundleId) : null);
      const stratumId =
        inferStratumFromText(tool.argumentSummary) ??
        (bundleId !== null ? inferStratumFromText(bundleId) : null) ??
        "catchment";
      return {
        kind: "land",
        stratumId,
        bundleId,
        recipeId,
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "summarize_observations": {
      const bundleId =
        extractEntityWithPrefix(tool.argumentSummary, "bundle_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      const recipeId = bundleId !== null ? inferRecipeFromBundleId(bundleId) : null;
      const stratumId =
        inferStratumFromText(tool.argumentSummary) ??
        (bundleId !== null ? inferStratumFromText(bundleId) : null) ??
        "catchment";
      return {
        kind: "land",
        stratumId,
        bundleId,
        recipeId,
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "compare_series": {
      const bundleId =
        extractEntityWithPrefix(tool.argumentSummary, "bundle_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      const stratumId =
        inferStratumFromText(tool.argumentSummary) ??
        (bundleId !== null ? inferStratumFromText(bundleId) : null) ??
        "catchment";
      return {
        kind: "land",
        stratumId,
        bundleId,
        recipeId: "aligned_antecedent",
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "read_dataset_manifest": {
      const bundleId =
        extractEntityWithPrefix(tool.argumentSummary, "bundle_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      const recipeId = bundleId !== null ? inferRecipeFromBundleId(bundleId) : null;
      const stratumId =
        inferStratumFromText(tool.argumentSummary) ??
        (bundleId !== null ? inferStratumFromText(bundleId) : null);
      return {
        kind: "bundle",
        stratumId,
        bundleId,
        recipeId,
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "list_recipes": {
      const bundleId = firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      return {
        kind: "bundle",
        stratumId: null,
        bundleId,
        recipeId: bundleId !== null ? inferRecipeFromBundleId(bundleId) : null,
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "search_occurrences": {
      const bundleId =
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_") ??
        extractEntityWithPrefix(tool.argumentSummary, "bundle_");
      return {
        kind: "land",
        stratumId: "catchment",
        bundleId,
        recipeId: "species_occurrences",
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: parseOccurrenceTermsFromSummary(tool.argumentSummary),
      };
    }

    case "read_event_record": {
      const bundleId =
        extractEntityWithPrefix(tool.argumentSummary, "bundle_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      return {
        kind: "bundle",
        stratumId: null,
        bundleId,
        recipeId: null,
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "compare_events": {
      const bundleId =
        extractEntityWithPrefix(tool.argumentSummary, "bundle_") ??
        firstEntityWithPrefix(tool.resultEntityIds, "bundle_");
      return {
        kind: "land",
        stratumId: "catchment",
        bundleId,
        recipeId: "season_summary",
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }

    case "read_case":
    case "read_evidence":
    case "propose_plan":
    case "propose_evidence":
    case "propose_hypotheses":
    case "propose_predictions":
    case "propose_interventions":
    case "propose_package":
    case "propose_instruments":
    case "propose_layout":
    case "request_review": {
      return {
        kind: "case",
        stratumId: null,
        bundleId: null,
        recipeId: null,
        sourceId: null,
        pages: [],
        sections: [],
        queryTerms: [],
      };
    }
  }
}
