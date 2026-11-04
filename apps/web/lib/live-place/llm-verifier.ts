import type { Source } from "@siterra/contracts";
import {
  type ChoreographyOptions,
  DEFAULT_BAND_LIMIT_M,
  DEFAULT_MAX_ELEVATION_M,
  DEFAULT_META_MODEL,
  DEFAULT_MIN_ELEVATION_M,
  type ExplanationId,
  type LlmCauseDraft,
  type LlmHypothesisDraft,
  type LlmInterventionDraft,
  type LlmReasonerOutput,
  type LlmVerifiedFinding,
  type VisualChoreographyTarget,
} from "./llm-schema-and-prompt.ts";

export const PROHIBITED_CLAIM_REGEX = /\b(prove|proves|proven|certainly|definitely|guaranteed)\b/i;

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
 * of any stored excerpt/note on `source`. The title is not part of the corpus: a few words of
 * a title would otherwise "verify" any statement made about it.
 */
export function isVerbatimQuoteInSource(candidateQuote: string, source: Source): boolean {
  const normQuote = normalizeForQuoteCheck(candidateQuote)
    .replace(/\.{3,}$/, "")
    .trim();
  if (normQuote.length < 12) return false;

  for (const part of source.notes) {
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
    Number.isFinite(bandLimitM) && bandLimitM > 0 ? Math.round(bandLimitM) : DEFAULT_BAND_LIMIT_M;
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
  const combined =
    `${finding.statement} ${finding.exactQuote} ${finding.interpretation}`.toLowerCase();
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
    if (containsProhibitedClaim(statement) || containsProhibitedClaim(interpretation)) {
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
  const validExpIds = new Set(["rainfall", "grazing", "land_use", "snow_terrain", "data_artefact"]);
  const causes: LlmCauseDraft[] = [];
  for (const item of rawCauses) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const explanationId = typeof c["explanationId"] === "string" ? c["explanationId"].trim() : "";
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
        method: sanitizeProhibitedWords(
          method || "Structured local interviews and transect checks",
        ),
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
  const visualChoreography = canonicalExplanations.flatMap((expId) => {
    const item = choreographyByExp.get(expId);
    return item ? [item] : [];
  });

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
