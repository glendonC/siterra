import type { Source } from "@siterra/contracts";
import { type HistoricalClimateSummary, rainTrendText } from "./climate-series.ts";

export const META_API_BASE_URL = "https://api.meta.ai/v1";
export const META_API_HOST = "api.meta.ai";
export const DEFAULT_META_MODEL = "muse-spark-1.3";
export const DEFAULT_META_KEYCHAIN_SERVICE = "siterra-meta-model-api";
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
export const MIN_MAX_OUTPUT_TOKENS = 1024;

export type ExplanationId =
  | "rainfall"
  | "grazing"
  | "land_use"
  | "snow_terrain"
  | "data_artefact";

export type ChoreographyStageId =
  | "rain"
  | "agdal"
  | "band"
  | "time"
  | "pixel"
  | "fdr"
  | "routes";

export type ChoreographyLayer = "ndvi" | "rain" | "cover" | "routes" | null;

export interface VisualChoreographyTarget {
  explanationId: ExplanationId;
  stageId: ChoreographyStageId;
  camera: { zoom: number; turn: number };
  elevationBandM: [number, number] | null;
  layer: ChoreographyLayer;
  sourceId: string | null;
  exactQuote: string | null;
}

export interface ChoreographyOptions {
  minElevationM?: number | undefined;
  maxElevationM?: number | undefined;
  sourceId?: string | null | undefined;
  exactQuote?: string | null | undefined;
}

export const DEFAULT_BAND_LIMIT_M = 2317;
export const DEFAULT_MIN_ELEVATION_M = 1800;
export const DEFAULT_MAX_ELEVATION_M = 3200;

export interface LlmConfig {
  provider: "meta";
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface ResolveLlmConfigOptions {
  apiKey?: string | undefined;
  model?: string | undefined;
  baseUrl?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  allowKeychain?: boolean | undefined;
  keychainService?: string | undefined;
  readKeychain?: ((service: string) => string | null) | undefined;
}

export interface LlmHypothesisDraft {
  key: "land_use" | "grazing" | "rainfall";
  statement: string;
  assessment: string;
  status: "consistent" | "inconsistent" | "inconclusive" | "untested";
}

export interface LlmInterventionDraft {
  title: string;
  description: string;
  assumptions: string[];
  fieldValidationNeeded: string[];
  livelihoodConsiderations: string[];
  targetExplanation: "land_use" | "grazing" | "rainfall" | "defer";
}

export interface LlmCauseDraft {
  explanationId: ExplanationId;
  statement: string;
  statusReason: string;
  prediction: string;
  fieldCheck: {
    what: string;
    method: string;
    seasonWindow: string;
  };
  visualFocus?: VisualChoreographyTarget | undefined;
}

export interface LlmVerifiedFinding {
  statement: string;
  sourceId: string;
  exactQuote: string;
  interpretation: string;
}

export interface LlmReasonerOutput {
  provider: "meta";
  model: string;
  hypotheses: LlmHypothesisDraft[];
  interventions: LlmInterventionDraft[];
  causes: LlmCauseDraft[];
  verifiedFindings: LlmVerifiedFinding[];
  briefSummary: string;
  visualChoreography?: VisualChoreographyTarget[] | undefined;
}

export interface LlmReasonerInput {
  placeName: string;
  regionName: string;
  lon: number;
  lat: number;
  /** From the place's terrain grid, or null when it is not loaded. */
  minElevationM: number | null;
  maxElevationM: number | null;
  bandLimitM?: number | undefined;
  areaKm2?: number | undefined;
  climate: HistoricalClimateSummary;
  sources: readonly Source[];
  question?: string | undefined;
  config?: LlmConfig | null | undefined;
  fetchImpl?: typeof globalThis.fetch | undefined;
  timeoutMs?: number | undefined;
  maxOutputTokens?: number | undefined;
}

/**
 * Strict JSON Schema conforming to Meta's structured-output subset (`strict-schema.ts`):
 * root is an object, every object has `additionalProperties: false`, and every property is listed in `required`.
 */
export const LLM_REASONER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", enum: ["land_use", "grazing", "rainfall"] },
          statement: { type: "string" },
          assessment: { type: "string" },
          status: {
            type: "string",
            enum: ["consistent", "inconsistent", "inconclusive", "untested"],
          },
        },
        required: ["key", "statement", "assessment", "status"],
      },
    },
    interventions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          assumptions: { type: "array", items: { type: "string" } },
          fieldValidationNeeded: { type: "array", items: { type: "string" } },
          livelihoodConsiderations: { type: "array", items: { type: "string" } },
          targetExplanation: {
            type: "string",
            enum: ["land_use", "grazing", "rainfall", "defer"],
          },
        },
        required: [
          "title",
          "description",
          "assumptions",
          "fieldValidationNeeded",
          "livelihoodConsiderations",
          "targetExplanation",
        ],
      },
    },
    causes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanationId: {
            type: "string",
            enum: ["rainfall", "grazing", "land_use", "snow_terrain", "data_artefact"],
          },
          statement: { type: "string" },
          statusReason: { type: "string" },
          prediction: { type: "string" },
          fieldCheck: {
            type: "object",
            additionalProperties: false,
            properties: {
              what: { type: "string" },
              method: { type: "string" },
              seasonWindow: { type: "string" },
            },
            required: ["what", "method", "seasonWindow"],
          },
        },
        required: ["explanationId", "statement", "statusReason", "prediction", "fieldCheck"],
      },
    },
    verifiedFindings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          statement: { type: "string" },
          sourceId: { type: "string" },
          exactQuote: { type: "string" },
          interpretation: { type: "string" },
        },
        required: ["statement", "sourceId", "exactQuote", "interpretation"],
      },
    },
    briefSummary: {
      type: "string",
    },
  },
  required: ["hypotheses", "interventions", "causes", "verifiedFindings", "briefSummary"],
} as const;

/** The three driest and three wettest calendar years of the rainfall series. */
function deriveClimateExtremes(climate: LlmReasonerInput["climate"]): {
  droughtYears: number[];
  wetYears: number[];
} {
  const sortedByPrecip = [...climate.years].sort((a, b) => a.precipMm - b.precipMm);
  return {
    droughtYears: sortedByPrecip.slice(0, 3).map((y) => y.year),
    wetYears: sortedByPrecip
      .slice(-3)
      .reverse()
      .map((y) => y.year),
  };
}

/**
 * Builds the structured prompt payload for Meta `muse-spark-1.3` over `https://api.meta.ai/v1/responses`.
 */
export function buildMetaResponsesRequestBody(
  input: LlmReasonerInput,
  model: string,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
): Record<string, unknown> {
  const safeMaxTokens = Math.max(MIN_MAX_OUTPUT_TOKENS, maxOutputTokens);
  const extremes = deriveClimateExtremes(input.climate);
  const rainTrend = rainTrendText(input.climate);

  const sourceLines = input.sources.slice(0, 10).map((s) => {
    const excerpt = s.notes[0] ?? s.title;
    return `- [${s.id}] (${s.sourceKind}, ${s.publicationDate ?? "n.d."}, ${s.publisher ?? "Publisher"}): "${s.title}"\n  Verbatim Excerpt: "${excerpt}"`;
  });

  const instructions = [
    "You are Siterra's scientific watershed reasoner running on Meta muse-spark-1.3.",
    "Ground every hypothesis, causal explanation branch, candidate intervention, and verified finding strictly in the provided rainfall metrics, terrain elevation span, and retrieved source excerpts. Values listed as not measured do not exist; never state or estimate them.",
    "CRITICAL RULES:",
    "1. Never use prohibited certainty words: prove, proves, proven, certainly, definitely, guaranteed.",
    "2. In `verifiedFindings`, `sourceId` MUST be an exact ID from the provided Sources list, and `exactQuote` MUST be a character-for-character verbatim substring copied directly from that source's `Verbatim Excerpt`.",
    "3. Output ONLY a single valid JSON object conforming strictly to the `siterra_case_reasoning` schema.",
  ].join("\n");

  const userPrompt = [
    `Place: ${input.placeName} (${input.regionName})`,
    `Coordinates: ${input.lat.toFixed(4)}°N, ${input.lon.toFixed(4)}°E`,
    `Elevation Span: ${input.minElevationM === null || input.maxElevationM === null ? "not loaded" : `${input.minElevationM.toFixed(0)} m to ${input.maxElevationM.toFixed(0)} m`} (Catchment Area: ${input.areaKm2 === undefined ? "not loaded" : `${input.areaKm2.toFixed(1)} km²`})`,
    `Question: ${input.question?.trim() || `What is known, and what is not yet measured, about land and water across ${input.placeName}?`}`,
    "",
    ...(rainTrend === null
      ? [`Rainfall: not measured. ${input.climate.unavailableReason ?? ""}`.trim()]
      : [
          `Rainfall (${input.climate.source.label}, ${String(input.climate.years.length)} calendar years, ${input.climate.source.window}):`,
          `- Precipitation trend: ${rainTrend} mm/decade${input.climate.precipTrendLowerMmPerDecade !== null && input.climate.precipTrendUpperMmPerDecade !== null ? ` (95% interval ${input.climate.precipTrendLowerMmPerDecade.toFixed(1)} to ${input.climate.precipTrendUpperMmPerDecade.toFixed(1)})` : ""}`,
          `- Driest calendar years: ${extremes.droughtYears.join(", ")}`,
          `- Wettest calendar years: ${extremes.wetYears.join(", ")}`,
        ]),
    "Not measured (state these as not measured; never estimate them): vegetation index (NDVI) values and trends, the share of vegetation change rainfall explains, temperature trend, soil moisture.",
    `- ${input.climate.vegetation.reason}`,
    "",
    "Retrieved Sources & Verbatim Excerpts:",
    sourceLines.join("\n"),
  ].join("\n");

  return {
    model,
    store: false,
    stream: false,
    instructions,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: safeMaxTokens,
    text: {
      format: {
        type: "json_schema",
        name: "siterra_case_reasoning",
        schema: LLM_REASONER_JSON_SCHEMA,
        strict: true,
      },
    },
  };
}
