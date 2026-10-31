import { describe, expect, it } from "vitest";
import { ToolCallInfo, ToolCallTarget } from "./case.ts";
import { enrichToolCallTarget, resolveToolCallTarget } from "./tool-target.ts";

const baseToolCall = {
  startedAt: "2026-10-28T16:19:44.826Z",
  endedAt: "2026-10-28T16:19:44.847Z",
  durationMs: 21,
  errorCode: null,
  attempt: 1,
} as const;

describe("ToolCallTarget contract and resolveToolCallTarget", () => {
  it("validates ToolCallTarget and allows ToolCallInfo with target omitted, null, or populated", () => {
    const target: ToolCallTarget = {
      kind: "source",
      stratumId: null,
      bundleId: null,
      recipeId: null,
      sourceId: "src_SCI-127",
      pages: [7, 12],
      sections: [],
      queryTerms: [],
    };
    expect(ToolCallTarget.safeParse(target).success).toBe(true);
    expect(ToolCallTarget.safeParse({ ...target, pages: [0] }).success).toBe(false);

    const omitted = ToolCallInfo.safeParse({
      ...baseToolCall,
      name: "read_source",
      status: "succeeded",
      argumentSummary: "source src_SCI-127, 2 passages",
      resultEntityIds: ["src_SCI-127"],
    });
    expect(omitted.success).toBe(true);

    const withNull = ToolCallInfo.safeParse({
      ...baseToolCall,
      name: "read_source",
      status: "succeeded",
      argumentSummary: "source src_SCI-127, 2 passages",
      resultEntityIds: ["src_SCI-127"],
      target: null,
    });
    expect(withNull.success).toBe(true);

    const withTarget = ToolCallInfo.safeParse({
      ...baseToolCall,
      name: "read_source",
      status: "succeeded",
      argumentSummary: "source src_SCI-127, 2 passages",
      resultEntityIds: ["src_SCI-127"],
      target,
    });
    expect(withTarget.success).toBe(true);
  });

  it("returns tool.target directly when present on ToolCallInfo", () => {
    const explicit: ToolCallTarget = {
      kind: "land",
      stratumId: "valley_floor",
      bundleId: "bundle_restrend_long_record_ait_bouguemez",
      recipeId: "restrend_long_record",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    };
    const tool: ToolCallInfo = {
      ...baseToolCall,
      name: "read_recipe_result",
      status: "succeeded",
      argumentSummary: "restrend_long_record 1.0.0 from bundle_restrend_long_record_ait_bouguemez",
      resultEntityIds: ["bundle_restrend_long_record_ait_bouguemez"],
      target: explicit,
    };
    expect(resolveToolCallTarget(tool)).toBe(explicit);
  });

  it("derives deterministic targets from recorded-run ToolCallInfo shapes without target", () => {
    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "read_source",
        status: "succeeded",
        argumentSummary: "source src_SCI-127, 3 passages",
        resultEntityIds: ["src_SCI-127"],
      }),
    ).toEqual({
      kind: "source",
      stratumId: null,
      bundleId: null,
      recipeId: null,
      sourceId: "src_SCI-127",
      pages: [],
      sections: [],
      queryTerms: [],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "search_sources",
        status: "succeeded",
        argumentSummary: "query of 6 terms",
        resultEntityIds: ["src_SCI-04", "src_SCI-127"],
      }),
    ).toEqual({
      kind: "source",
      stratumId: null,
      bundleId: null,
      recipeId: null,
      sourceId: "src_SCI-04",
      pages: [],
      sections: [],
      queryTerms: [],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "read_recipe_result",
        status: "succeeded",
        argumentSummary: "terrain_strata 1.0.0 from bundle_terrain_strata_ait_bouguemez",
        resultEntityIds: ["bundle_terrain_strata_ait_bouguemez"],
      }),
    ).toEqual({
      kind: "land",
      stratumId: "catchment",
      bundleId: "bundle_terrain_strata_ait_bouguemez",
      recipeId: "terrain_strata",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "summarize_observations",
        status: "succeeded",
        argumentSummary:
          "bundle bundle_ndvi_departure_ait_bouguemez revision 1, 12 periods, ndvi_departure_valley_floor",
        resultEntityIds: ["meas_ndvi_departure_ait_bouguemez_2024-06_ndvi_departure_area_median"],
      }),
    ).toEqual({
      kind: "land",
      stratumId: "valley_floor",
      bundleId: "bundle_ndvi_departure_ait_bouguemez",
      recipeId: "monthly_departure",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "compare_series",
        status: "succeeded",
        argumentSummary:
          "bundle_ndvi_departure_ait_bouguemez ndvi_departure_area_median against bundle_chirps_monthly_ait_bouguemez precipitation_departure_from_1991_2020_mean",
        resultEntityIds: [],
      }),
    ).toEqual({
      kind: "land",
      stratumId: "catchment",
      bundleId: "bundle_ndvi_departure_ait_bouguemez",
      recipeId: "aligned_antecedent",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "read_dataset_manifest",
        status: "succeeded",
        argumentSummary: "bundle bundle_ndvi_departure_ait_bouguemez",
        resultEntityIds: ["bundle_ndvi_departure_ait_bouguemez"],
      }),
    ).toEqual({
      kind: "bundle",
      stratumId: null,
      bundleId: "bundle_ndvi_departure_ait_bouguemez",
      recipeId: "monthly_departure",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: [],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "search_occurrences",
        status: "succeeded",
        argumentSummary: "occurrences matching Juniperus, plants, at most 10",
        resultEntityIds: ["bundle_species_occurrences_ait_bouguemez"],
      }),
    ).toEqual({
      kind: "land",
      stratumId: "catchment",
      bundleId: "bundle_species_occurrences_ait_bouguemez",
      recipeId: "species_occurrences",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: ["Juniperus", "plants"],
    });

    expect(
      resolveToolCallTarget({
        ...baseToolCall,
        name: "summarize_observations",
        status: "rejected",
        argumentSummary: "Arguments did not validate.",
        resultEntityIds: [],
      }),
    ).toBeNull();
  });

  it("enriches sourceId and bundleId on completion when initial target had null", () => {
    const searchStarted: ToolCallTarget = {
      kind: "source",
      stratumId: null,
      bundleId: null,
      recipeId: null,
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: ["agdal", "grazing"],
    };
    expect(enrichToolCallTarget(searchStarted, ["src_SCI-04", "src_SCI-127"])).toEqual({
      ...searchStarted,
      sourceId: "src_SCI-04",
    });

    const occurrencesStarted: ToolCallTarget = {
      kind: "land",
      stratumId: "catchment",
      bundleId: null,
      recipeId: "species_occurrences",
      sourceId: null,
      pages: [],
      sections: [],
      queryTerms: ["plants"],
    };
    expect(
      enrichToolCallTarget(occurrencesStarted, ["bundle_species_occurrences_ait_bouguemez"]),
    ).toEqual({
      ...occurrencesStarted,
      bundleId: "bundle_species_occurrences_ait_bouguemez",
    });
  });
});
