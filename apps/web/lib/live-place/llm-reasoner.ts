import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import {
  type ChoreographyLayer,
  type ChoreographyOptions,
  type ChoreographyStageId,
  DEFAULT_BAND_LIMIT_M,
  DEFAULT_MAX_ELEVATION_M,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_META_KEYCHAIN_SERVICE,
  DEFAULT_META_MODEL,
  DEFAULT_MIN_ELEVATION_M,
  type ExplanationId,
  LLM_REASONER_JSON_SCHEMA,
  type LlmCauseDraft,
  type LlmConfig,
  type LlmHypothesisDraft,
  type LlmInterventionDraft,
  type LlmReasonerInput,
  type LlmReasonerOutput,
  type LlmVerifiedFinding,
  META_API_BASE_URL,
  META_API_HOST,
  MIN_MAX_OUTPUT_TOKENS,
  type ResolveLlmConfigOptions,
  type VisualChoreographyTarget,
  buildMetaResponsesRequestBody,
} from "./llm-schema-and-prompt.ts";
import {
  PROHIBITED_CLAIM_REGEX,
  choreographyForExplanation,
  containsProhibitedClaim,
  isVerbatimQuoteInSource,
  normalizeForQuoteCheck,
  verifyLlmReasonerOutput,
} from "./llm-verifier.ts";

export {
  type ChoreographyLayer,
  type ChoreographyOptions,
  type ChoreographyStageId,
  DEFAULT_BAND_LIMIT_M,
  DEFAULT_MAX_ELEVATION_M,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_META_KEYCHAIN_SERVICE,
  DEFAULT_META_MODEL,
  DEFAULT_MIN_ELEVATION_M,
  type ExplanationId,
  LLM_REASONER_JSON_SCHEMA,
  type LlmCauseDraft,
  type LlmConfig,
  type LlmHypothesisDraft,
  type LlmInterventionDraft,
  type LlmReasonerInput,
  type LlmReasonerOutput,
  type LlmVerifiedFinding,
  META_API_BASE_URL,
  META_API_HOST,
  MIN_MAX_OUTPUT_TOKENS,
  PROHIBITED_CLAIM_REGEX,
  type ResolveLlmConfigOptions,
  type VisualChoreographyTarget,
  buildMetaResponsesRequestBody,
  choreographyForExplanation,
  containsProhibitedClaim,
  isVerbatimQuoteInSource,
  normalizeForQuoteCheck,
  verifyLlmReasonerOutput,
};

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
    const key = res.stdout.replace(/\r?\n$/, "").trim();
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
 * `reasoning.effort = "low"`) and runs `verifyLlmReasonerOutput`
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
  const timer = setTimeout(() => {
    ac.abort();
  }, timeoutMs);
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

    const contentType = res.headers.get("content-type") ?? "";
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
