import { EventRecordRow } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import { AT, CASE_ID, TEST_ANALYSIS_CONFIG, bundle, testStore } from "../testing/case-fixture.ts";
import type { EventRecordRowRecord } from "../tasks/records.ts";
import { compareEventsTool, readEventRecordTool, seasonFor } from "./event-tools.ts";
import type { MemoryCaseStore } from "./store.ts";
import type { ParsedArgs, ToolOutput } from "./tool.ts";

// SYNTHETIC FIXTURE. Every event row, excerpt and season below is invented for these tests and is
// marked synthetic in its text. The real event bundle is built only after GATE-01 and the
// founder's spend cap; nothing here reaches the case seed or the UI fixture.

interface Runnable {
  parse(args: unknown): ParsedArgs<unknown>;
  run(args: never, signal: AbortSignal): Promise<ToolOutput>;
}
const signal = new AbortController().signal;
function run(tool: Runnable, args: unknown): Promise<ToolOutput> {
  const parsed = tool.parse(args);
  if (!parsed.ok) throw new Error(parsed.message);
  return tool.run(parsed.value as never, signal);
}

function row(
  id: string,
  eventStart: string,
  direction: EventRecordRowRecord["rainfallDirection"],
  eventType: EventRecordRowRecord["eventType"] = "rainfall_statement",
): EventRecordRowRecord {
  return {
    recordType: "EventRecordRow",
    id,
    revision: 1,
    createdAt: AT.toISOString(),
    updatedAt: AT.toISOString(),
    caseId: CASE_ID,
    dataBundleId: "bundle_test_events",
    dataBundleRevision: 1,
    eventType,
    eventStart,
    eventEnd: null,
    scope: "national",
    placeNamed: null,
    sourceLocator: {
      sourceId: "src_test_report",
      locator: "report.pdf, page 2",
      excerpt: "Synthetic excerpt for a test.",
    },
    sourceLanguage: "en",
    statementEn: "A synthetic statement for a test.",
    rainfallDirection: direction,
    extractionModel: "synthetic",
    extractionRequestId: null,
  };
}

function eventStore(): MemoryCaseStore {
  const store = testStore();
  store.bundles.push(
    bundle({
      id: "bundle_test_events",
      revision: 1,
      datasetId: "event_record",
      methodId: "event_extraction",
      periodIds: [],
    }),
    bundle({
      id: "bundle_test_rain",
      revision: 1,
      datasetId: "chirps",
      periodIds: ["period_2021-11"],
    }),
    bundle({
      id: "bundle_test_seasons",
      revision: 1,
      methodId: "season_summary",
      methodVersion: "1.0.0",
      periodIds: [],
    }),
  );
  store.eventRows.push(
    row("erow_test_dec", "2021-12-15", "below_normal"),
    row("erow_test_mar", "2022-03", "above_normal"),
    row("erow_test_none", "2022-04-01", "not_stated", "feed_subsidy"),
    row("erow_test_year", "2022", "below_normal"),
    row("erow_test_old", "2010-02", "below_normal"),
  );
  store.recipeResults.push({
    caseId: CASE_ID,
    bundleId: "bundle_test_seasons",
    recipeId: "season_summary",
    version: "1.0.0",
    result: {
      recipeId: "season_summary",
      version: "1.0.0",
      rainfall_bundle: { id: "bundle_test_rain" },
      near_normal_band_mm: [100, 200],
      seasons: [
        {
          season_id: "season_2021-11_2022-04",
          season_departure_mm: -50.5,
          season_category: "below_normal",
        },
      ],
    },
  });
  return store;
}

const COMPARE = {
  eventBundleId: "bundle_test_events",
  eventBundleRevision: 1,
  rainfallBundleId: "bundle_test_rain",
  rainfallBundleRevision: 1,
  geoSelectionId: "geo_test_catchment",
  geoRevision: 1,
};

describe("season mapping (season_summary 1.0.0)", () => {
  const wet = TEST_ANALYSIS_CONFIG.rainfallSeason;
  it("maps November and December to the season starting that November, other months to the one before", () => {
    expect(seasonFor("2021-11-02", wet)).toBe("season_2021-11_2022-04");
    expect(seasonFor("2021-12", wet)).toBe("season_2021-11_2022-04");
    expect(seasonFor("2022-04-30", wet)).toBe("season_2021-11_2022-04");
    expect(seasonFor("2022-10", wet)).toBe("season_2021-11_2022-04");
    expect(seasonFor("2022", wet)).toBeNull();
  });

  it("maps a season that does not wrap the year by the same rule", () => {
    const rainy = { startMonth: 6, endMonth: 9 };
    expect(seasonFor("2022-07-10", rainy)).toBe("season_2022-06_2022-09");
    expect(seasonFor("2022-11", rainy)).toBe("season_2022-06_2022-09");
    expect(seasonFor("2022-03", rainy)).toBe("season_2021-06_2021-09");
  });
});

describe("read_event_record", () => {
  it("returns rows whose start falls in the periods, filtered by type, with the bundle counts", async () => {
    const result = await run(readEventRecordTool(eventStore(), CASE_ID), {
      bundleId: "bundle_test_events",
      bundleRevision: 1,
      periodIds: ["period_2021-12", "period_2022-03", "period_2022-04"],
      eventTypes: ["rainfall_statement"],
    });
    const output = result.output as { rows: { rowId: string }[]; counts: unknown; label: string };
    expect(output.rows.map((r) => r.rowId)).toEqual([
      "erow_test_dec",
      "erow_test_mar",
      "erow_test_year",
    ]);
    expect(output.counts).toEqual({ rowsInBundle: 5, rowsReturned: 3 });
    expect(output.label).toBe("published context, not an observation");
  });

  it("refuses a bundle that is not a validated event bundle, or a stale revision", async () => {
    const tool = readEventRecordTool(eventStore(), CASE_ID);
    await expect(
      run(tool, {
        bundleId: "bundle_test_rain",
        bundleRevision: 1,
        periodIds: ["period_2022-03"],
        eventTypes: null,
      }),
    ).rejects.toMatchObject({
      code: "bundle_not_validated",
    });
    await expect(
      run(tool, {
        bundleId: "bundle_test_events",
        bundleRevision: 2,
        periodIds: ["period_2022-03"],
        eventTypes: null,
      }),
    ).rejects.toMatchObject({
      code: "stale_reference",
    });
  });
});

describe("compare_events", () => {
  it("compares stated directions with the season's tercile category, by code only", async () => {
    const result = await run(compareEventsTool(eventStore(), CASE_ID), {
      ...COMPARE,
      eventRowIds: [
        "erow_test_dec",
        "erow_test_mar",
        "erow_test_none",
        "erow_test_year",
        "erow_test_old",
      ],
    });
    const output = result.output as {
      results: { rowId: string; result: string; seasonDepartureMm?: number }[];
      label: string;
    };
    expect(output.results.map((r) => `${r.rowId} ${r.result}`)).toEqual([
      "erow_test_dec agrees",
      "erow_test_mar does_not_agree",
      "erow_test_none not_applicable",
      "erow_test_year no_matching_period",
      "erow_test_old no_matching_period",
    ]);
    expect(output.results[0]?.seasonDepartureMm).toBe(-50.5);
    expect(output.label).toBe("precomputed analysis");
  });

  it("refuses unknown rows, a season summary from another rainfall bundle and a geometry at another revision", async () => {
    await expect(
      run(compareEventsTool(eventStore(), CASE_ID), {
        ...COMPARE,
        eventRowIds: ["erow_test_none_such"],
      }),
    ).rejects.toMatchObject({
      code: "unknown_reference",
    });
    const other = eventStore();
    other.bundles.push(bundle({ id: "bundle_test_rain_two", revision: 1, periodIds: [] }));
    await expect(
      run(compareEventsTool(other, CASE_ID), {
        ...COMPARE,
        rainfallBundleId: "bundle_test_rain_two",
        eventRowIds: ["erow_test_dec"],
      }),
    ).rejects.toMatchObject({ code: "recipe_mismatch" });
    await expect(
      run(compareEventsTool(eventStore(), CASE_ID), {
        ...COMPARE,
        geoRevision: 2,
        eventRowIds: ["erow_test_dec"],
      }),
    ).rejects.toMatchObject({
      code: "stale_reference",
    });
  });

  it("uses the season window and season recipe another place's configuration names", async () => {
    const store = eventStore();
    store.analysisConfigs.set(CASE_ID, {
      ...TEST_ANALYSIS_CONFIG,
      rainfallSeason: {
        id: "rainy_season",
        label: "June to September rainy season",
        startMonth: 6,
        endMonth: 9,
        recipe: { recipeId: "season_summary", version: "2.0.0" },
      },
    });
    store.eventRows.push(row("erow_test_aug", "2021-08", "below_normal"));
    const args = { ...COMPARE, eventRowIds: ["erow_test_aug"] };
    // Only the 1.0.0 summary is stored, so the configured 2.0.0 one is missing.
    await expect(run(compareEventsTool(store, CASE_ID), args)).rejects.toMatchObject({
      code: "no_season_summary",
    });
    store.bundles.push(
      bundle({
        id: "bundle_test_seasons_two",
        revision: 1,
        methodId: "season_summary",
        methodVersion: "2.0.0",
        periodIds: [],
      }),
    );
    store.recipeResults.push({
      caseId: CASE_ID,
      bundleId: "bundle_test_seasons_two",
      recipeId: "season_summary",
      version: "2.0.0",
      result: {
        rainfall_bundle: { id: "bundle_test_rain" },
        seasons: [
          {
            season_id: "season_2021-06_2021-09",
            season_departure_mm: -12.5,
            season_category: "below_normal",
          },
        ],
      },
    });
    const output = (await run(compareEventsTool(store, CASE_ID), args)).output as {
      recipe: string;
      results: { result: string; seasonId: string }[];
    };
    expect(output.recipe).toBe("season_summary 2.0.0");
    expect(output.results).toMatchObject([
      { result: "agrees", seasonId: "season_2021-06_2021-09" },
    ]);
  });

  it("refuses when the case has no analysis configuration", async () => {
    const store = eventStore();
    store.analysisConfigs.clear();
    await expect(
      run(compareEventsTool(store, CASE_ID), { ...COMPARE, eventRowIds: ["erow_test_dec"] }),
    ).rejects.toMatchObject({ code: "no_case_config" });
  });

  it("the synthetic rows follow the event record contract", () => {
    for (const r of eventStore().eventRows) expect(EventRecordRow.safeParse(r).success).toBe(true);
  });
});
