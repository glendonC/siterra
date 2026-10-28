import type { Usage } from "./types.ts";

export interface PriceEntry {
  model: string;
  /** USD per million fresh input tokens. */
  inputPerMillion: number;
  /** USD per million cached input tokens (a subset of input tokens). */
  cachedPerMillion: number;
  /** USD per million output tokens, reasoning included. */
  outputPerMillion: number;
  checkedOn: string;
  source: string;
}

/** List prices; every cost the product shows is labeled an estimate computed from this table. */
export const PRICE_TABLE: readonly PriceEntry[] = [
  {
    model: "muse-spark-1.3",
    inputPerMillion: 1.25,
    cachedPerMillion: 0.15,
    outputPerMillion: 4.25,
    checkedOn: "2026-10-27",
    source: "https://dev.meta.ai/docs/pricing-rate-limits",
  },
];

export function priceFor(model: string): PriceEntry | null {
  return PRICE_TABLE.find((p) => p.model === model) ?? null;
}

/** Cost estimate from reported usage, or null when the model is unpriced or usage is incomplete. */
export function estimateCostUsd(model: string, usage: Usage): number | null {
  const price = priceFor(model);
  const { inputTokens, outputTokens, cachedTokens } = usage;
  if (!price || inputTokens === null || outputTokens === null || cachedTokens === null) return null;
  if (cachedTokens > inputTokens) return null;
  return (
    ((inputTokens - cachedTokens) * price.inputPerMillion +
      cachedTokens * price.cachedPerMillion +
      outputTokens * price.outputPerMillion) /
    1_000_000
  );
}

/** Worst-case cost of one attempt: every input token fresh and the full output budget spent. */
export function worstCaseCostUsd(
  model: string,
  inputTokensBound: number,
  maxOutputTokens: number,
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  return (
    (inputTokensBound * price.inputPerMillion + maxOutputTokens * price.outputPerMillion) /
    1_000_000
  );
}
