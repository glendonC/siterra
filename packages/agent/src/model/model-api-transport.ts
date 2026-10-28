import OpenAI, { APIError } from "openai";
import type { ClientOptions } from "openai";

import { scrubSecrets } from "./secrets.ts";
import { TransportError, parseRetryAfter } from "./transport.ts";
import type { ModelTransport, ResponsesBody, TransportStream } from "./transport.ts";

// The live route to Meta's Model API through the `openai` client (pinned 7.32.0). It is built only
// when the worker is told GATE-01 has passed; until then every call runs on a replay transport.

export const MODEL_API_BASE_URL = "https://api.meta.ai/v1";

/** The only host the key may be sent to. */
export const MODEL_API_HOST = "api.meta.ai";

/** True for an https URL on the Meta Model API host, with no credentials in the URL. */
export function isModelApiUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === MODEL_API_HOST &&
    (parsed.port === "" || parsed.port === "443") &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

export interface ModelApiTransportOptions {
  apiKey: string;
  baseURL?: string;
  /** Must be true; set by the worker only after GATE-01 has passed and a spend cap is recorded. */
  liveApproved: boolean;
  /** The client's fetch; tests pass a fake to see the request. */
  fetch?: ClientOptions["fetch"];
}

function headerValue(headers: unknown, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  if (typeof headers === "object" && headers !== null) {
    const value = (headers as Record<string, unknown>)[name];
    return typeof value === "string" ? value : null;
  }
  return null;
}

type CreateParams = Parameters<OpenAI["responses"]["create"]>[0];

export class ModelApiTransport implements ModelTransport {
  readonly route = "model_api" as const;
  readonly replayOrigin = null;
  readonly #client: OpenAI;
  /** Kept only to remove the key from error text. */
  readonly #key: string;

  constructor(options: ModelApiTransportOptions) {
    if (!options.liveApproved) {
      throw new Error("live model route is not approved; use a replay transport");
    }
    const baseURL = options.baseURL ?? MODEL_API_BASE_URL;
    if (!isModelApiUrl(baseURL)) {
      throw new Error(
        `the key is only sent to https://${MODEL_API_HOST}; the base URL is not that host`,
      );
    }
    // Retries and stream deadlines belong to the adapter, so the client does neither.
    this.#key = options.apiKey;
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL,
      maxRetries: 0,
      timeout: 600_000,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream> {
    try {
      const { data, request_id } = await this.#client.responses
        .create({ ...body, stream: true } as CreateParams, { signal })
        .withResponse();
      return {
        requestId: request_id ?? null,
        events: data as unknown as AsyncIterable<unknown>,
      };
    } catch (error) {
      if (error instanceof APIError && typeof error.status === "number") {
        // Only the status and the code leave here, never the body; the code is scrubbed too.
        const code = typeof error.code === "string" ? scrubSecrets(error.code, [this.#key]) : null;
        const retryAfter = parseRetryAfter(headerValue(error.headers, "retry-after"), Date.now());
        throw new TransportError(error.status, code, retryAfter);
      }
      // No HTTP status: the request was aborted or never reached the server. Neither is retried.
      if (signal.aborted) throw new TransportError(0, "cancelled", null);
      if (error instanceof APIError) throw new TransportError(0, "connection_error", null);
      if (error instanceof Error) error.message = scrubSecrets(error.message, [this.#key]);
      throw error;
    }
  }
}
