import type { ModelRoute, ReplayOrigin } from "./types.ts";

/** The Responses API request body the adapter builds. Only the adapter and transports see it. */
export type ResponsesBody = Record<string, unknown>;

export interface TransportStream {
  /** Request ID from the HTTP response headers, when the transport can read one. */
  requestId: string | null;
  /** Raw Responses stream events, parsed from SSE `data` lines. */
  events: AsyncIterable<unknown>;
}

export interface ModelTransport {
  readonly route: ModelRoute;
  readonly replayOrigin: ReplayOrigin | null;
  open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream>;
}

/** An HTTP error before the stream started. */
export class TransportError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterMs: number | null;

  constructor(status: number, code: string | null, retryAfterMs: number | null) {
    super(`HTTP ${status}${code ? ` ${code}` : ""}`);
    this.name = "TransportError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Reads a `Retry-After` header given in seconds or as an HTTP date. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}
