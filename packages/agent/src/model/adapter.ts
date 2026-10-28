import { foldStream } from "./normalize.ts";
import type { FoldedStream } from "./normalize.ts";
import { estimateCostUsd, worstCaseCostUsd } from "./pricing.ts";
import { ReplayError } from "./replay.ts";
import { buildResponsesBody } from "./request.ts";
import { DEFAULT_RETRY, RETRYABLE_HTTP, retryDelayMs } from "./retry.ts";
import type { RetryPolicy } from "./retry.ts";
import { StrictSchemaError } from "./strict-schema.ts";
import { DEFAULT_DEADLINES, StreamTimeout, withDeadlines } from "./timeouts.ts";
import type { StreamDeadlines } from "./timeouts.ts";
import { TransportError } from "./transport.ts";
import type { ModelTransport, ResponsesBody } from "./transport.ts";
import type {
  CallAttempt,
  CallStatus,
  ModelCallResult,
  ModelEvent,
  ModelRequest,
  Usage,
} from "./types.ts";

/**
 * Host-side spend ledger. The adapter reserves the worst case before every attempt and settles
 * with the computed estimate afterwards; an unknown estimate keeps the reservation.
 */
export interface SpendGuard {
  reserve(usd: number): boolean;
  settle(reservedUsd: number, estimateUsd: number | null): void;
}

/** Limits concurrent model calls, for example to two per case. */
export interface CallGate {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export interface AdapterOptions {
  transport: ModelTransport;
  gate?: CallGate;
  deadlines?: StreamDeadlines;
  retry?: RetryPolicy;
  spend?: SpendGuard;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface CallOptions {
  signal?: AbortSignal;
  onEvent?: (event: ModelEvent) => void;
}

function sleepFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Conservative input bound for the spend reservation: two characters per token. */
function inputTokensBound(body: ResponsesBody): number {
  return Math.ceil(JSON.stringify([body["instructions"], body["input"]]).length / 2);
}

function addUsage(total: Usage, add: Usage): Usage {
  const sum = (a: number | null, b: number | null): number | null =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return {
    inputTokens: sum(total.inputTokens, add.inputTokens),
    outputTokens: sum(total.outputTokens, add.outputTokens),
    cachedTokens: sum(total.cachedTokens, add.cachedTokens),
    reasoningTokens: sum(total.reasoningTokens, add.reasoningTokens),
  };
}

const NO_USAGE: Usage = {
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  reasoningTokens: null,
};

/** The single entry point for model calls. One `call` is one model turn, retries included. */
export class MetaAdapter {
  readonly #transport: ModelTransport;
  readonly #deadlines: StreamDeadlines;
  readonly #retry: RetryPolicy;
  readonly #spend: SpendGuard | null;
  readonly #gate: CallGate | null;
  readonly #sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly #random: () => number;
  readonly #now: () => number;

  constructor(options: AdapterOptions) {
    this.#transport = options.transport;
    this.#deadlines = options.deadlines ?? DEFAULT_DEADLINES;
    this.#retry = options.retry ?? DEFAULT_RETRY;
    this.#spend = options.spend ?? null;
    this.#gate = options.gate ?? null;
    this.#sleep = options.sleep ?? sleepFor;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
  }

  get route(): ModelTransport["route"] {
    return this.#transport.route;
  }

  get replayOrigin(): ModelTransport["replayOrigin"] {
    return this.#transport.replayOrigin;
  }

  /** One model call, retries included, holding a gate slot for its whole duration. */
  call(request: ModelRequest, options: CallOptions = {}): Promise<ModelCallResult> {
    return this.#gate
      ? this.#gate.run(() => this.#call(request, options))
      : this.#call(request, options);
  }

  async #call(request: ModelRequest, options: CallOptions): Promise<ModelCallResult> {
    const signal = options.signal ?? new AbortController().signal;
    const aborted = (): boolean => signal.aborted;
    const emit = options.onEvent ?? ((): void => undefined);
    const started = this.#now();
    const attempts: CallAttempt[] = [];
    let usage: Usage = NO_USAGE;
    let costKnown = true;
    let cost = 0;
    let requestId: string | null = null;
    let last: FoldedStream | null = null;

    const result = (status: CallStatus, errorCode: string | null): ModelCallResult => ({
      status,
      model: request.model,
      route: this.#transport.route,
      replayOrigin: this.#transport.replayOrigin,
      promptVersion: request.promptVersion,
      providerResponseId: last?.responseId ?? null,
      providerRequestId: requestId,
      outputText: status === "succeeded" ? (last?.text ?? "") : "",
      refusal: status === "refused" ? (last?.refusal ?? "") : null,
      incompleteReason: status === "incomplete" ? (last?.incompleteReason ?? null) : null,
      toolCalls: status === "succeeded" ? (last?.toolCalls ?? []) : [],
      replayItems: status === "succeeded" ? (last?.replayItems ?? []) : [],
      usage,
      costEstimateUsd: costKnown && attempts.length > 0 ? cost : null,
      errorCode,
      attempts,
      durationMs: this.#now() - started,
    });

    let body: ResponsesBody;
    try {
      body = buildResponsesBody(request);
    } catch (error) {
      if (error instanceof StrictSchemaError)
        return result("failed", "schema_outside_strict_subset");
      throw error;
    }

    let delay = 0;
    for (let attempt = 1; attempt <= this.#retry.maxRetries + 1; attempt += 1) {
      if (signal.aborted) return result("failed", "cancelled");
      const reserved =
        worstCaseCostUsd(request.model, inputTokensBound(body), request.maxOutputTokens) ?? 0;
      if (this.#spend && !this.#spend.reserve(reserved))
        return result("failed", "budget_exhausted");

      const record = (
        outcome: CallStatus,
        code: string | null,
        httpStatus: number | null,
        attemptUsage: Usage | null,
      ): void => {
        const estimate = attemptUsage ? estimateCostUsd(request.model, attemptUsage) : null;
        // An HTTP error before the stream is assumed unbilled; an opened stream without usage is unknown.
        const billedUnknown = attemptUsage !== null && estimate === null;
        if (billedUnknown) costKnown = false;
        if (estimate !== null) cost += estimate;
        if (attemptUsage) usage = addUsage(usage, attemptUsage);
        this.#spend?.settle(reserved, httpStatus !== null ? 0 : estimate);
        attempts.push({
          attempt,
          outcome,
          code,
          httpStatus,
          delayBeforeMs: delay,
          usage: attemptUsage,
          costEstimateUsd: estimate,
        });
      };

      const controller = new AbortController();
      const onAbort = (): void => {
        controller.abort();
      };
      signal.addEventListener("abort", onAbort);
      let transient: boolean;
      let retryAfterMs: number | null = null;
      try {
        const stream = await this.#transport.open(body, controller.signal);
        requestId = stream.requestId ?? requestId;
        last = await foldStream(
          withDeadlines(stream.events, this.#deadlines, onAbort),
          attempt,
          emit,
        );
        const status: CallStatus = last.outcome === "completed" ? "succeeded" : last.outcome;
        record(status, last.code, null, last.usage);
        // Read through a call: the signal can change while the stream is awaited.
        if (aborted()) return result("failed", "cancelled");
        if (last.outcome !== "failed") return result(status, null);
        transient = last.transient;
      } catch (error) {
        if (error instanceof TransportError) {
          const code = error.code ?? `http_${error.status}`;
          transient = RETRYABLE_HTTP.has(error.status);
          retryAfterMs = error.retryAfterMs;
          emit({ type: "failed", attempt, code, transient });
          record("failed", code, error.status, null);
          last = null;
          if (!transient || attempt > this.#retry.maxRetries) return result("failed", code);
        } else if (error instanceof StreamTimeout) {
          transient = true;
          emit({ type: "failed", attempt, code: error.code, transient });
          record("failed", error.code, null, NO_USAGE);
          last = null;
          if (attempt > this.#retry.maxRetries) return result("failed", error.code);
        } else if (error instanceof ReplayError) {
          emit({ type: "failed", attempt, code: error.code, transient: false });
          record("failed", error.code, null, null);
          return result("failed", error.code);
        } else {
          throw error;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }

      const lastCode = attempts.at(-1)?.code ?? "server_error";
      if (!transient || attempt > this.#retry.maxRetries) return result("failed", lastCode);
      delay = retryDelayMs(this.#retry, attempt, retryAfterMs, this.#random);
      await this.#sleep(delay, signal);
    }
    return result("failed", attempts.at(-1)?.code ?? "server_error");
  }
}
