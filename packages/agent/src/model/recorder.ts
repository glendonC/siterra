import { REPLAY_FORMAT } from "./replay.ts";
import type { ReplayFile, ReplayStep } from "./replay.ts";
import { TransportError } from "./transport.ts";
import type { ModelTransport, ResponsesBody, TransportStream } from "./transport.ts";

// Wraps a transport and keeps what each call saw as replay steps, so a real run can be replayed
// later with origin "recorded". Request bodies and headers are not kept; only stream events,
// HTTP error statuses and request IDs.

/** Model API keys have the form LLM_{numeric id}_{secret}; bearer headers must never appear. */
const SECRET_PATTERNS = [/LLM_\d+_[A-Za-z0-9]/, /Bearer\s+\S/i];

export class SecretInRecordingError extends Error {
  constructor() {
    super("a recorded step contains a credential-like string; nothing was written");
    this.name = "SecretInRecordingError";
  }
}

export function assertNoSecrets(file: ReplayFile): void {
  const text = JSON.stringify(file);
  if (SECRET_PATTERNS.some((p) => p.test(text))) throw new SecretInRecordingError();
}

export class RecordingTransport implements ModelTransport {
  readonly route: ModelTransport["route"];
  readonly replayOrigin: ModelTransport["replayOrigin"];
  readonly #inner: ModelTransport;
  readonly #steps: ReplayStep[] = [];

  constructor(inner: ModelTransport) {
    this.#inner = inner;
    this.route = inner.route;
    this.replayOrigin = inner.replayOrigin;
  }

  async open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream> {
    let stream: TransportStream;
    try {
      stream = await this.#inner.open(body, signal);
    } catch (error) {
      if (error instanceof TransportError) {
        this.#steps.push({
          kind: "http_error",
          status: error.status,
          code: error.code,
          retryAfter: error.retryAfterMs === null ? null : String(error.retryAfterMs / 1000),
        });
      }
      throw error;
    }
    const events: unknown[] = [];
    this.#steps.push({ kind: "stream", requestId: stream.requestId, events });
    const source = stream.events;
    async function* tee(): AsyncGenerator {
      for await (const event of source) {
        events.push(structuredClone(event));
        yield event;
      }
    }
    return { requestId: stream.requestId, events: tee() };
  }

  /** The recording as a replay file. Throws before returning anything credential-like. */
  toReplayFile(model: string, description: string): ReplayFile {
    const file: ReplayFile = {
      format: REPLAY_FORMAT,
      origin: "recorded",
      model,
      description,
      steps: structuredClone(this.#steps),
    };
    assertNoSecrets(file);
    return file;
  }
}
