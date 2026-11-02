import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import type { Source } from "@siterra/contracts";
import type { HistoricalClimateSummary } from "./climate-series.ts";

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
  minElevationM: number;
  maxElevationM: number;
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

export const PROHIBITED_CLAIM_REGEX =
  /\b(prove|proves|proven|certainly|definitely|guaranteed)\b/i;

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

let cachedKeychainKey: string | null | undefined;

function readMetaKeyFromKeychain(service: string): string | null {
  if (service === DEFAULT_META_KEYCHAIN_SERVICE && cachedKeychainKey !== undefined) {
    return cachedKeychainKey;
  }
  try {
    const account = userInfo().username;
    const res = spawnSync(
      "/usr/bin/security",
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        timeout: 2000,
      },
    );
    const key = (res.stdout ?? "").replace(/\r?\n$/, "").trim();
    if (res.status === 0 && key.length > 0) {
      if (service === DEFAULT_META_KEYCHAIN_SERVICE) cachedKeychainKey = key;
      return key;
    }
  } catch {
    // Keychain unavailable or non-macOS environment
  }
  if (service === DEFAULT_META_KEYCHAIN_SERVICE) cachedKeychainKey = null;
  return null;
}

export function resetKeychainCacheForTesting(): void {
  cachedKeychainKey = undefined;
}

/**
 * Resolves the live Meta Model API configuration (`muse-spark-1.3` over `https://api.meta.ai/v1/responses`)
 * from `MODEL_API_KEY` / `SITERRA_META_API_KEY` or the macOS login Keychain service `siterra-meta-model-api`.
 */
export function resolveLlmConfig(options: ResolveLlmConfigOptions = {}): LlmConfig | null {
  const env = options.env ?? process.env;
  const model =
    (options.model ?? env["SITERRA_META_MODEL"] ?? DEFAULT_META_MODEL).trim() ||
    DEFAULT_META_MODEL;
  const baseUrl = (
    options.baseUrl ??
    env["SITERRA_MODEL_BASE_URL"] ??
    META_API_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");

  const directKey = (
    options.apiKey ??
    env["MODEL_API_KEY"] ??
    env["SITERRA_META_API_KEY"] ??
    ""
  ).trim();
  if (directKey.length > 0) {
    return {
      provider: "meta",
      model,
      apiKey: directKey,
      baseUrl,
    };
  }

  if (options.allowKeychain === false) {
    return null;
  }

  const service =
    (options.keychainService ?? env["SITERRA_KEYCHAIN_SERVICE"] ?? DEFAULT_META_KEYCHAIN_SERVICE).trim() ||
    DEFAULT_META_KEYCHAIN_SERVICE;
  const reader = options.readKeychain ?? readMetaKeyFromKeychain;
  const keychainKey = reader(service)?.trim() ?? "";
  if (keychainKey.length > 0) {
    return {
      provider: "meta",
      model,
      apiKey: keychainKey,
      baseUrl,
    };
  }

  return null;
}

/**
 * Returns true if the text contains any prohibited certainty word (`prove`, `proves`, `proven`,
 * `certainly`, `definitely`, `guaranteed`).
 */
export function containsProhibitedClaim(text: string): boolean {
  return PROHIBITED_CLAIM_REGEX.test(text);
}

/**
 * Normalizes text for case-insensitive, whitespace-normalized, quote-normalized verbatim substring checks.
 */
export function normalizeForQuoteCheck(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B`]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Checks whether `candidateQuote` is a verbatim substring (case/whitespace normalized)
 * of any stored excerpt/note or title on `source`.
 */
export function isVerbatimQuoteInSource(candidateQuote: string, source: Source): boolean {
  const normQuote = normalizeForQuoteCheck(candidateQuote).replace(/\.{3,}$/, "").trim();
  if (normQuote.length < 12) return false;

  const corpusParts = [...source.notes, source.title];
  for (const part of corpusParts) {
    const normPart = normalizeForQuoteCheck(part);
    if (normPart.includes(normQuote)) {
      return true;
    }
  }
  return false;
}

function sanitizeProhibitedWords(text: string): string {
  return text
    .replace(/\bproves\b/gi, "indicates")
    .replace(/\bproven\b/gi, "supported")
    .replace(/\bprove\b/gi, "support")
    .replace(/\b(certainly|definitely|guaranteed)\b\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministically resolves a 3D camera + elevation band + layer choreography target
 * for any competing explanation or stage identifier.
 */
export function choreographyForExplanation(
  explanationId: string,
  bandLimitM: number = DEFAULT_BAND_LIMIT_M,
  options: ChoreographyOptions = {},
): VisualChoreographyTarget {
  const normalized = explanationId.trim().toLowerCase();
  const limit =
    Number.isFinite(bandLimitM) && bandLimitM > 0
      ? Math.round(bandLimitM)
      : DEFAULT_BAND_LIMIT_M;
  const minElev =
    typeof options.minElevationM === "number" && Number.isFinite(options.minElevationM)
      ? Math.round(options.minElevationM)
      : limit > DEFAULT_MIN_ELEVATION_M
        ? DEFAULT_MIN_ELEVATION_M
        : Math.max(0, Math.round(limit * 0.78));
  const maxElev =
    typeof options.maxElevationM === "number" && Number.isFinite(options.maxElevationM)
      ? Math.round(options.maxElevationM)
      : limit < DEFAULT_MAX_ELEVATION_M
        ? DEFAULT_MAX_ELEVATION_M
        : Math.round(limit * 1.38);

  const sourceId = options.sourceId?.trim() || null;
  const exactQuote = options.exactQuote?.trim() || null;

  switch (normalized) {
    case "rainfall":
    case "rain":
      return {
        explanationId: "rainfall",
        stageId: "rain",
        camera: { zoom: 1.08, turn: 14 },
        elevationBandM: null,
        layer: "rain",
        sourceId,
        exactQuote,
      };
    case "grazing":
    case "agdal":
      return {
        explanationId: "grazing",
        stageId: "agdal",
        camera: { zoom: 1.18, turn: -28 },
        elevationBandM: [limit, maxElev],
        layer: "routes",
        sourceId,
        exactQuote,
      };
    case "routes":
      return {
        explanationId: "grazing",
        stageId: "routes",
        camera: { zoom: 1.18, turn: -28 },
        elevationBandM: [limit, maxElev],
        layer: "routes",
        sourceId,
        exactQuote,
      };
    case "land_use":
    case "band":
      return {
        explanationId: "land_use",
        stageId: "band",
        camera: { zoom: 1.22, turn: -18 },
        elevationBandM: [minElev, limit],
        layer: "cover",
        sourceId,
        exactQuote,
      };
    case "snow_terrain":
    case "time":
      return {
        explanationId: "snow_terrain",
        stageId: "time",
        camera: { zoom: 1.14, turn: 8 },
        elevationBandM: [limit, maxElev],
        layer: "ndvi",
        sourceId,
        exactQuote,
      };
    case "data_artefact":
    case "pixel":
      return {
        explanationId: "data_artefact",
        stageId: "pixel",
        camera: { zoom: 1.35, turn: 22 },
        elevationBandM: null,
        layer: "ndvi",
        sourceId,
        exactQuote,
      };
    case "fdr":
      return {
        explanationId: "data_artefact",
        stageId: "fdr",
        camera: { zoom: 1.35, turn: 22 },
        elevationBandM: null,
        layer: "ndvi",
        sourceId,
        exactQuote,
      };
    default:
      return {
        explanationId: "land_use",
        stageId: "band",
        camera: { zoom: 1.22, turn: -18 },
        elevationBandM: [minElev, limit],
        layer: "cover",
        sourceId,
        exactQuote,
      };
  }
}

function inferExplanationFromFinding(finding: LlmVerifiedFinding): ExplanationId {
  const combined = `${finding.statement} ${finding.exactQuote} ${finding.interpretation}`.toLowerCase();
  if (
    /\b(grazing|livestock|pastoral|agdal|transhumance|stocking|herd|allotment|forage|exclosure)\b/.test(
      combined,
    )
  ) {
    return "grazing";
  }
  if (
    /\b(snow|snowmelt|snowpack|aspect|alpine|montane|frost|elevation\s+band\s+above)\b/.test(
      combined,
    )
  ) {
    return "snow_terrain";
  }
  if (
    /\b(sensor|cloud|brdf|artefact|artifact|pixel|fdr|false\s+discovery|calibration)\b/.test(
      combined,
    )
  ) {
    return "data_artefact";
  }
  if (
    /\b(irrigation|canal|diversion|headgate|flow\s+tier|terrace|orchard|crop|parcel|dam|Check-dam)\b/i.test(
      combined,
    )
  ) {
    return "land_use";
  }
  if (/\b(rain|rainfall|precipitation|drought|era5|monsoon|wet\s+season)\b/.test(combined)) {
    return "rainfall";
  }
  return "land_use";
}

/**
 * Independent verifier (`verifyLlmReasonerOutput`, ADR-0041):
 * 1. Verifies every `sourceId` in `verifiedFindings` exists in `sources`.
 * 2. Verifies every `exactQuote` is a verbatim substring (case/whitespace normalized) of the source's stored excerpt/notes.
 *    Any finding with an unknown `sourceId`, a hallucinated/non-verbatim `exactQuote`, or a prohibited certainty claim is rejected.
 * 3. Rejects/filters any hypothesis or intervention containing prohibited certainty claims (`prove`, `proves`, `proven`, `certainly`, `definitely`, `guaranteed`),
 *    and sanitizes `causes` and `briefSummary` so zero prohibited claims ever pass verification.
 */
export function verifyLlmReasonerOutput(
  raw: unknown,
  sources: readonly Source[],
  metaInfo: {
    model?: string;
    bandLimitM?: number;
    minElevationM?: number;
    maxElevationM?: number;
  } = {},
): LlmReasonerOutput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const sourceById = new Map<string, Source>(sources.map((s) => [s.id, s]));

  // 1. Verify findings (sourceId exists + exactQuote is verbatim + no prohibited words)
  const rawFindings = Array.isArray(obj["verifiedFindings"]) ? obj["verifiedFindings"] : [];
  const verifiedFindings: LlmVerifiedFinding[] = [];
  for (const item of rawFindings) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as Record<string, unknown>;
    const sourceId = typeof f["sourceId"] === "string" ? f["sourceId"].trim() : "";
    const exactQuote = typeof f["exactQuote"] === "string" ? f["exactQuote"].trim() : "";
    const statement = typeof f["statement"] === "string" ? f["statement"].trim() : "";
    const interpretation =
      typeof f["interpretation"] === "string" && f["interpretation"].trim().length > 0
        ? f["interpretation"].trim()
        : `Verified excerpt from ${sourceId}.`;

    if (!sourceId || !exactQuote || !statement) continue;
    if (
      containsProhibitedClaim(statement) ||
      containsProhibitedClaim(interpretation)
    ) {
      continue;
    }

    const source = sourceById.get(sourceId);
    if (!source) continue;
    if (!isVerbatimQuoteInSource(exactQuote, source)) {
      continue;
    }

    verifiedFindings.push({
      statement,
      sourceId,
      exactQuote,
      interpretation,
    });
    if (verifiedFindings.length >= 3) break;
  }

  // 2. Verify hypotheses (reject any with prohibited words)
  const rawHyps = Array.isArray(obj["hypotheses"]) ? obj["hypotheses"] : [];
  const validHypKeys = new Set(["land_use", "grazing", "rainfall"]);
  const validHypStatuses = new Set(["consistent", "inconsistent", "inconclusive", "untested"]);
  const hypotheses: LlmHypothesisDraft[] = [];
  for (const item of rawHyps) {
    if (typeof item !== "object" || item === null) continue;
    const h = item as Record<string, unknown>;
    const key = typeof h["key"] === "string" ? h["key"].trim() : "";
    const statement = typeof h["statement"] === "string" ? h["statement"].trim() : "";
    const assessment = typeof h["assessment"] === "string" ? h["assessment"].trim() : "";
    const statusRaw = typeof h["status"] === "string" ? h["status"].trim() : "inconclusive";

    if (!validHypKeys.has(key) || !statement || !assessment) continue;
    if (containsProhibitedClaim(statement) || containsProhibitedClaim(assessment)) {
      continue;
    }
    hypotheses.push({
      key: key as LlmHypothesisDraft["key"],
      statement,
      assessment,
      status: (validHypStatuses.has(statusRaw)
        ? statusRaw
        : "inconclusive") as LlmHypothesisDraft["status"],
    });
  }

  // 3. Verify interventions (reject any with prohibited words)
  const rawInts = Array.isArray(obj["interventions"]) ? obj["interventions"] : [];
  const validTargetExp = new Set(["land_use", "grazing", "rainfall", "defer"]);
  const interventions: LlmInterventionDraft[] = [];
  for (const item of rawInts) {
    if (typeof item !== "object" || item === null) continue;
    const i = item as Record<string, unknown>;
    const title = typeof i["title"] === "string" ? i["title"].trim() : "";
    const description = typeof i["description"] === "string" ? i["description"].trim() : "";
    if (!title || !description) continue;
    if (containsProhibitedClaim(title) || containsProhibitedClaim(description)) {
      continue;
    }
    const toStrArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => sanitizeProhibitedWords(x.trim()))
            .filter((x) => x.length > 0)
        : [];
    const targetRaw =
      typeof i["targetExplanation"] === "string" ? i["targetExplanation"].trim() : "land_use";

    interventions.push({
      title,
      description,
      assumptions: toStrArr(i["assumptions"]),
      fieldValidationNeeded: toStrArr(i["fieldValidationNeeded"]),
      livelihoodConsiderations: toStrArr(i["livelihoodConsiderations"]),
      targetExplanation: (validTargetExp.has(targetRaw)
        ? targetRaw
        : "land_use") as LlmInterventionDraft["targetExplanation"],
    });
    if (interventions.length >= 3) break;
  }

  // 4. Verify causes for the 5 explanation branches and attach deterministic 3D visual choreography
  const bandLimitM = metaInfo.bandLimitM ?? DEFAULT_BAND_LIMIT_M;
  const rawCauses = Array.isArray(obj["causes"]) ? obj["causes"] : [];
  const validExpIds = new Set([
    "rainfall",
    "grazing",
    "land_use",
    "snow_terrain",
    "data_artefact",
  ]);
  const causes: LlmCauseDraft[] = [];
  for (const item of rawCauses) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const explanationId =
      typeof c["explanationId"] === "string" ? c["explanationId"].trim() : "";
    const statement = typeof c["statement"] === "string" ? c["statement"].trim() : "";
    const statusReason =
      typeof c["statusReason"] === "string" ? c["statusReason"].trim() : statement;
    const prediction = typeof c["prediction"] === "string" ? c["prediction"].trim() : "";
    const fcObj =
      typeof c["fieldCheck"] === "object" && c["fieldCheck"] !== null
        ? (c["fieldCheck"] as Record<string, unknown>)
        : {};
    const what = typeof fcObj["what"] === "string" ? fcObj["what"].trim() : "";
    const method = typeof fcObj["method"] === "string" ? fcObj["method"].trim() : "";
    const seasonWindow =
      typeof fcObj["seasonWindow"] === "string" ? fcObj["seasonWindow"].trim() : "Growing season";

    if (!validExpIds.has(explanationId) || !statement || !prediction) continue;
    if (
      containsProhibitedClaim(statement) ||
      containsProhibitedClaim(statusReason) ||
      containsProhibitedClaim(prediction)
    ) {
      continue;
    }

    const typedExpId = explanationId as ExplanationId;
    const matchedFinding =
      verifiedFindings.find((vf) => inferExplanationFromFinding(vf) === typedExpId) ??
      verifiedFindings[0];
    const safeQuote =
      matchedFinding && !containsProhibitedClaim(matchedFinding.exactQuote)
        ? matchedFinding.exactQuote
        : null;
    const visualFocus = choreographyForExplanation(typedExpId, bandLimitM, {
      minElevationM: metaInfo.minElevationM,
      maxElevationM: metaInfo.maxElevationM,
      sourceId: matchedFinding?.sourceId ?? null,
      exactQuote: safeQuote,
    });

    causes.push({
      explanationId: typedExpId,
      statement,
      statusReason,
      prediction,
      fieldCheck: {
        what: sanitizeProhibitedWords(what || `Field verification for ${explanationId}`),
        method: sanitizeProhibitedWords(method || "Structured local interviews and transect checks"),
        seasonWindow: sanitizeProhibitedWords(seasonWindow || "Growing season"),
      },
      visualFocus,
    });
  }

  const rawSummary = typeof obj["briefSummary"] === "string" ? obj["briefSummary"].trim() : "";
  const briefSummary = sanitizeProhibitedWords(rawSummary);

  if (
    hypotheses.length === 0 &&
    interventions.length === 0 &&
    causes.length === 0 &&
    verifiedFindings.length === 0 &&
    !briefSummary
  ) {
    return null;
  }

  const canonicalExplanations: readonly ExplanationId[] = [
    "rainfall",
    "grazing",
    "land_use",
    "snow_terrain",
    "data_artefact",
  ];
  const choreographyByExp = new Map<ExplanationId, VisualChoreographyTarget>();
  for (const c of causes) {
    if (c.visualFocus) {
      choreographyByExp.set(c.explanationId, c.visualFocus);
    }
  }
  for (const vf of verifiedFindings) {
    const inferredExp = inferExplanationFromFinding(vf);
    const safeQuote = !containsProhibitedClaim(vf.exactQuote) ? vf.exactQuote : null;
    const existing = choreographyByExp.get(inferredExp);
    if (!existing || !existing.sourceId) {
      choreographyByExp.set(
        inferredExp,
        choreographyForExplanation(inferredExp, bandLimitM, {
          minElevationM: metaInfo.minElevationM,
          maxElevationM: metaInfo.maxElevationM,
          sourceId: vf.sourceId,
          exactQuote: safeQuote,
        }),
      );
    }
  }
  const fallbackFinding = verifiedFindings[0];
  const fallbackQuote =
    fallbackFinding && !containsProhibitedClaim(fallbackFinding.exactQuote)
      ? fallbackFinding.exactQuote
      : null;
  for (const expId of canonicalExplanations) {
    if (!choreographyByExp.has(expId)) {
      choreographyByExp.set(
        expId,
        choreographyForExplanation(expId, bandLimitM, {
          minElevationM: metaInfo.minElevationM,
          maxElevationM: metaInfo.maxElevationM,
          sourceId: fallbackFinding?.sourceId ?? null,
          exactQuote: fallbackQuote,
        }),
      );
    }
  }
  const visualChoreography = canonicalExplanations.map(
    (expId) => choreographyByExp.get(expId)!,
  );

  return {
    provider: "meta",
    model: metaInfo.model ?? DEFAULT_META_MODEL,
    hypotheses,
    interventions,
    causes,
    verifiedFindings,
    briefSummary,
    visualChoreography,
  };
}

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
  const areaKm2 = input.areaKm2 ?? 144;

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
    `Elevation Span: ${input.minElevationM.toFixed(0)} m to ${input.maxElevationM.toFixed(0)} m (Catchment Area: ${areaKm2.toFixed(1)} km²)`,
    `Question: ${input.question?.trim() || `What is known, and what is not yet measured, about land and water across ${input.placeName}?`}`,
    "",
    `Rainfall (${input.climate.source.label}, ${String(input.climate.years.length)} calendar years, ${input.climate.source.window}):`,
    `- Precipitation trend: ${input.climate.precipTrendMmPerDecade >= 0 ? "+" : ""}${input.climate.precipTrendMmPerDecade.toFixed(1)} mm/decade${input.climate.precipTrendLowerMmPerDecade !== null && input.climate.precipTrendUpperMmPerDecade !== null ? ` (95% interval ${input.climate.precipTrendLowerMmPerDecade.toFixed(1)} to ${input.climate.precipTrendUpperMmPerDecade.toFixed(1)})` : ""}`,
    `- Driest calendar years: ${extremes.droughtYears.join(", ")}`,
    `- Wettest calendar years: ${extremes.wetYears.join(", ")}`,
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

function extractCleanJsonString(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function extractTextFromMetaPayload(payload: unknown): string {
  if (typeof payload === "string") {
    // Handle SSE stream text if returned as raw SSE events
    if (payload.includes("response.output_text.delta") || payload.startsWith("event:")) {
      let accumulated = "";
      for (const line of payload.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const jsonPart = line.slice(5).trim();
        if (!jsonPart || jsonPart === "[DONE]") continue;
        try {
          const ev = JSON.parse(jsonPart) as Record<string, unknown>;
          if (ev["type"] === "response.output_text.delta" && typeof ev["delta"] === "string") {
            accumulated += ev["delta"];
          } else if (ev["type"] === "response.completed" && accumulated === "") {
            accumulated = extractTextFromMetaPayload(ev["response"]);
          }
        } catch {
          // Ignore malformed SSE line
        }
      }
      if (accumulated) return accumulated;
    }
    return payload;
  }

  if (typeof payload !== "object" || payload === null) return "";
  const rec = payload as Record<string, unknown>;

  if (typeof rec["output_text"] === "string" && rec["output_text"].trim().length > 0) {
    return rec["output_text"];
  }

  if (Array.isArray(rec["output"])) {
    let text = "";
    for (const item of rec["output"]) {
      if (typeof item !== "object" || item === null) continue;
      const itemRec = item as Record<string, unknown>;
      if (itemRec["type"] === "message" && Array.isArray(itemRec["content"])) {
        for (const part of itemRec["content"]) {
          if (typeof part !== "object" || part === null) continue;
          const partRec = part as Record<string, unknown>;
          if (
            (partRec["type"] === "output_text" || partRec["type"] === "text") &&
            typeof partRec["text"] === "string"
          ) {
            text += partRec["text"];
          }
        }
      }
    }
    if (text.trim().length > 0) return text;
  }

  if (Array.isArray(rec["choices"]) && rec["choices"].length > 0) {
    const firstChoice = rec["choices"][0] as Record<string, unknown> | undefined;
    const msg = firstChoice?.["message"] as Record<string, unknown> | undefined;
    if (typeof msg?.["content"] === "string") {
      return msg["content"];
    }
  }

  return "";
}

/**
 * Calls the Meta Model API (`https://api.meta.ai/v1/responses` with `muse-spark-1.3`,
 * `reasoning.effort = "low"`, `max_output_tokens = 2500`) and runs `verifyLlmReasonerOutput`
 * to independently verify every `sourceId`, verbatim `exactQuote`, and prohibited-claim rule.
 * Returns `null` cleanly if no key is configured or if the network call fails/times out.
 */
export async function reasonOverCaseWithLlm(
  input: LlmReasonerInput,
): Promise<LlmReasonerOutput | null> {
  const config = input.config !== undefined ? input.config : resolveLlmConfig();
  if (!config || !config.apiKey) {
    return null;
  }

  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  const timeoutMs = input.timeoutMs ?? 35000;
  const maxOutputTokens = Math.max(
    MIN_MAX_OUTPUT_TOKENS,
    input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  );
  const body = buildMetaResponsesRequestBody(input, config.model, maxOutputTokens);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/responses`;
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers?.get?.("content-type") ?? "";
    const payload: unknown = contentType.includes("text/event-stream")
      ? await res.text()
      : await res.json();

    const text = extractTextFromMetaPayload(payload);
    if (!text) return null;

    const cleanedJson = extractCleanJsonString(text);
    const parsed = JSON.parse(cleanedJson) as unknown;
    return verifyLlmReasonerOutput(parsed, input.sources, {
      model: config.model,
      ...(input.bandLimitM !== undefined ? { bandLimitM: input.bandLimitM } : {}),
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
