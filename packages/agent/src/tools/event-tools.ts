import { z } from "zod";

import type { EventRecordRowRecord } from "../tasks/records.ts";
import type { CaseStore } from "./store.ts";
import { ToolFailure } from "./tool.ts";
import type { ToolHandler } from "./tool.ts";
import { argumentSchema, parseWith } from "./zod-tool.ts";

// read_event_record and compare_events (docs/reference/data-contracts.md#tool-argument-contracts,
// docs/reference/agent-orchestration.md#event-record-p0-minimum-p1-search-and-reports). Rows come
// from a validated event bundle; agreement compares a stated rainfall direction with the tercile
// category of its November to April wet season from the stored season_summary result. Directions
// only: no averaging of text into numbers, and the model never supplies a season, departure or result.

export const EVENT_TYPES = [
  "drought_declaration",
  "emergency_program",
  "feed_subsidy",
  "transhumance_change",
  "pasture_rule",
  "rainfall_statement",
] as const;

const PERIOD_ID = /^period_(\d{4})-(0[1-9]|1[0-2])$/;
const MAX_PERIODS = 24;
const MAX_ROWS = 50;
export const SEASON_RECIPE = { recipeId: "season_summary", version: "1.0.0" } as const;

const ReadArgs = z.strictObject({
  bundleId: z.string(),
  bundleRevision: z.number(),
  periodIds: z.array(z.string()),
  eventTypes: z.array(z.enum(EVENT_TYPES)).nullable(),
});
type ReadArgs = z.infer<typeof ReadArgs>;

/** Period IDs an event start can fall in: its month, or every month of a year-only start. */
function startMonths(eventStart: string): { year: number; month: number | null } | null {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(eventStart);
  if (!m?.[1]) return null;
  return { year: Number(m[1]), month: m[2] ? Number(m[2]) : null };
}

function inPeriods(eventStart: string, periods: ReadonlySet<string>): boolean {
  const s = startMonths(eventStart);
  if (!s) return false;
  if (s.month !== null)
    return periods.has(`period_${String(s.year)}-${String(s.month).padStart(2, "0")}`);
  return [...periods].some((p) => p.startsWith(`period_${String(s.year)}-`));
}

/**
 * The November to April wet season an event start maps to (season_summary 1.0.0): a start in
 * November or December of year y maps to the season starting November y, any other month to the
 * season starting November y - 1. A year-only start has no month, so it maps to no season.
 */
export function seasonFor(eventStart: string): string | null {
  const s = startMonths(eventStart);
  if (!s || s.month === null) return null;
  const y = s.month >= 11 ? s.year : s.year - 1;
  return `season_${String(y)}-11_${String(y + 1)}-04`;
}

async function validatedEventBundle(
  store: CaseStore,
  caseId: string,
  bundleId: string,
  revision: number,
) {
  const bundle = await store.readBundle(caseId, bundleId);
  if (bundle?.status !== "validated" || bundle.datasetId !== "event_record") {
    throw new ToolFailure(
      "bundle_not_validated",
      `${bundleId} is not a validated event bundle in this case`,
    );
  }
  if (bundle.revision !== revision) {
    throw new ToolFailure(
      "stale_reference",
      `bundle ${bundle.id} is at revision ${bundle.revision}, not ${revision}`,
    );
  }
  return bundle;
}

export function readEventRecordTool(store: CaseStore, caseId: string): ToolHandler<ReadArgs> {
  return {
    name: "read_event_record",
    description: `Read the accepted rows of a validated event bundle whose event start falls in up to ${MAX_PERIODS} case periods, optionally of given event types. Each row has its scope, source locator, verbatim excerpt, source language, English statement and stated rainfall direction. Rows are published context, never observations.`,
    parameters: argumentSchema(ReadArgs),
    parse: (args) => {
      const parsed = parseWith(ReadArgs, args);
      if (!parsed.ok) return parsed;
      const { periodIds, bundleRevision } = parsed.value;
      if (!Number.isInteger(bundleRevision) || bundleRevision < 1) {
        return { ok: false, message: "$.bundleRevision: must be a positive integer" };
      }
      if (periodIds.length === 0 || periodIds.length > MAX_PERIODS) {
        return { ok: false, message: `$.periodIds: give 1 to ${MAX_PERIODS} period IDs` };
      }
      const bad = periodIds.find((p) => !PERIOD_ID.test(p));
      return bad === undefined
        ? parsed
        : { ok: false, message: `$.periodIds: ${bad} is not a period ID` };
    },
    summarize: (args) =>
      `event bundle ${args.bundleId} revision ${args.bundleRevision}, ${args.periodIds.length} ${args.periodIds.length === 1 ? "period" : "periods"}`,
    run: async (args) => {
      const bundle = await validatedEventBundle(store, caseId, args.bundleId, args.bundleRevision);
      const all = await store.readEventRows(caseId, bundle.id, bundle.revision);
      const periods = new Set(args.periodIds);
      const types = args.eventTypes === null ? null : new Set<string>(args.eventTypes);
      const rows = all.filter(
        (r) => inPeriods(r.eventStart, periods) && (types === null || types.has(r.eventType)),
      );
      return {
        output: {
          bundleId: bundle.id,
          bundleRevision: bundle.revision,
          label: "published context, not an observation",
          rows: rows.map((r) => ({
            rowId: r.id,
            eventType: r.eventType,
            eventStart: r.eventStart,
            eventEnd: r.eventEnd,
            scope: r.scope,
            placeNamed: r.placeNamed,
            sourceLocator: r.sourceLocator,
            sourceLanguage: r.sourceLanguage,
            statementEn: r.statementEn,
            rainfallDirection: r.rainfallDirection,
          })),
          counts: { rowsInBundle: all.length, rowsReturned: rows.length },
          limitations: bundle.provenance.limitations,
        },
        resultEntityIds: rows.map((r) => r.id),
      };
    },
  };
}

const CompareArgs = z.strictObject({
  eventBundleId: z.string(),
  eventBundleRevision: z.number(),
  eventRowIds: z.array(z.string()),
  rainfallBundleId: z.string(),
  rainfallBundleRevision: z.number(),
  geoSelectionId: z.string(),
  geoRevision: z.number(),
});
type CompareArgs = z.infer<typeof CompareArgs>;

interface SeasonRow {
  season_id: string;
  season_departure_mm: number;
  season_category: "below_normal" | "near_normal" | "above_normal";
}
interface SeasonSummary {
  recipeId: string;
  version: string;
  rainfall_bundle?: { id?: string };
  near_normal_band_mm?: number[];
  seasons: SeasonRow[];
}

export function compareEventsTool(store: CaseStore, caseId: string): ToolHandler<CompareArgs> {
  return {
    name: "compare_events",
    description: `For up to ${MAX_ROWS} event rows read with read_event_record, compare each stated rainfall direction with the tercile category of its November to April wet season in the catchment rainfall record (season_summary ${SEASON_RECIPE.version}). Results: agrees, does_not_agree, no_matching_period, or not_applicable when no direction is stated. A national statement can differ from the catchment and still be true for its own area.`,
    parameters: argumentSchema(CompareArgs),
    parse: (args) => {
      const parsed = parseWith(CompareArgs, args);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      for (const [key, n] of [
        ["eventBundleRevision", v.eventBundleRevision],
        ["rainfallBundleRevision", v.rainfallBundleRevision],
        ["geoRevision", v.geoRevision],
      ] as const) {
        if (!Number.isInteger(n) || n < 1)
          return { ok: false, message: `$.${key}: must be a positive integer` };
      }
      if (v.eventRowIds.length === 0 || v.eventRowIds.length > MAX_ROWS) {
        return { ok: false, message: `$.eventRowIds: give 1 to ${MAX_ROWS} row IDs` };
      }
      return parsed;
    },
    summarize: (args) =>
      `${args.eventRowIds.length} event ${args.eventRowIds.length === 1 ? "row" : "rows"} against ${args.rainfallBundleId}`,
    run: async (args) => {
      const events = await validatedEventBundle(
        store,
        caseId,
        args.eventBundleId,
        args.eventBundleRevision,
      );
      const rain = await store.readBundle(caseId, args.rainfallBundleId);
      if (rain?.status !== "validated")
        throw new ToolFailure("bundle_not_validated", `${args.rainfallBundleId} is not validated`);
      if (
        rain.revision !== args.rainfallBundleRevision ||
        rain.geoSelectionId !== args.geoSelectionId ||
        rain.geoRevision !== args.geoRevision
      ) {
        throw new ToolFailure(
          "stale_reference",
          "the rainfall bundle or its geometry is not at the cited revision",
        );
      }
      const seasonBundle = (await store.listBundles(caseId)).find(
        (b) =>
          b.status === "validated" &&
          b.methodId === SEASON_RECIPE.recipeId &&
          b.methodVersion === SEASON_RECIPE.version,
      );
      const stored = seasonBundle ? await store.readRecipeResult(caseId, seasonBundle.id) : null;
      const summary = stored?.result as SeasonSummary | undefined;
      if (!seasonBundle || !summary?.seasons) {
        throw new ToolFailure(
          "no_season_summary",
          `no precomputed ${SEASON_RECIPE.recipeId} ${SEASON_RECIPE.version} result in this case`,
        );
      }
      if (summary.rainfall_bundle?.id !== rain.id) {
        throw new ToolFailure(
          "recipe_mismatch",
          `the season summary was computed from ${summary.rainfall_bundle?.id ?? "another bundle"}, not ${rain.id}`,
        );
      }
      const rows = new Map(
        (await store.readEventRows(caseId, events.id, events.revision)).map((r) => [r.id, r]),
      );
      const unknown = args.eventRowIds.filter((id) => !rows.has(id));
      if (unknown.length > 0)
        throw new ToolFailure(
          "unknown_reference",
          `not rows of ${events.id}: ${unknown.join(", ")}`,
        );
      const seasons = new Map(summary.seasons.map((s) => [s.season_id, s]));
      const results = [...new Set(args.eventRowIds)].map((id) => {
        const row = rows.get(id) as EventRecordRowRecord;
        if (row.rainfallDirection === "not_stated")
          return { rowId: id, result: "not_applicable" as const, seasonId: null };
        const seasonId = seasonFor(row.eventStart);
        const season = seasonId === null ? undefined : seasons.get(seasonId);
        if (!season) return { rowId: id, result: "no_matching_period" as const, seasonId };
        return {
          rowId: id,
          result:
            row.rainfallDirection === season.season_category
              ? ("agrees" as const)
              : ("does_not_agree" as const),
          seasonId,
          statedDirection: row.rainfallDirection,
          seasonCategory: season.season_category,
          seasonDepartureMm: season.season_departure_mm,
          scope: row.scope,
        };
      });
      return {
        output: {
          label: "precomputed analysis",
          recipe: `${SEASON_RECIPE.recipeId} ${SEASON_RECIPE.version}`,
          seasonBundleId: seasonBundle.id,
          nearNormalBandMm: summary.near_normal_band_mm ?? null,
          results,
          limitations: [
            "Agreement compares directions only; it says nothing about cause.",
            "A national statement can differ from the catchment record and still be true for its own area.",
          ],
        },
        resultEntityIds: [...results.map((r) => r.rowId), seasonBundle.id],
      };
    },
  };
}
