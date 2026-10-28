// Retry rules from docs/reference/agent-orchestration.md#state-retry-and-recovery and Meta's
// error-handling page: retry 429, 500 and 503 (honor Retry-After), and streams that time out
// before the first event or go idle. Never retry 400, 401, 402, 403, 404 or 413.

export const RETRYABLE_HTTP = new Set([429, 500, 503]);

export interface RetryPolicy {
  /** Retries after the first attempt. */
  maxRetries: number;
  baseDelayMs: number;
  /** Upper bound of the random jitter added to each computed delay. */
  jitterMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxRetries: 2, baseDelayMs: 1_000, jitterMs: 1_000 };

/**
 * Delay before retry number `retry` (1-based). A provider Retry-After wins over backoff;
 * without one the delay doubles per retry with jitter in [0, jitterMs).
 */
export function retryDelayMs(
  policy: RetryPolicy,
  retry: number,
  retryAfterMs: number | null,
  random: () => number,
): number {
  if (retryAfterMs !== null) return retryAfterMs;
  return policy.baseDelayMs * 2 ** (retry - 1) + Math.floor(random() * policy.jitterMs);
}
