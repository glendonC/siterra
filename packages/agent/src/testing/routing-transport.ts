import type { ModelTransport, ResponsesBody, TransportStream } from "../model/transport.ts";
import type { ReplayTransport } from "../model/replay.ts";

// Test helper: routes each request to the synthetic replay of the task that sent it, keyed by the
// first line of its instructions, so concurrent tasks each play their own steps in order. It also
// counts how many streams are open at once.

export class RoutingTransport implements ModelTransport {
  readonly route = "replay" as const;
  readonly replayOrigin = "synthetic" as const;
  readonly #routes: [string, ReplayTransport][];
  #open = 0;
  peakOpen = 0;

  constructor(routes: [string, ReplayTransport][]) {
    this.#routes = routes;
  }

  async open(body: ResponsesBody, signal: AbortSignal): Promise<TransportStream> {
    const instructions = typeof body["instructions"] === "string" ? body["instructions"] : "";
    const target = this.#routes.find(([prefix]) => instructions.startsWith(prefix))?.[1];
    if (!target) throw new Error(`no route for instructions starting ${instructions.slice(0, 40)}`);
    const stream = await target.open(body, signal);
    this.#open += 1;
    this.peakOpen = Math.max(this.peakOpen, this.#open);
    const source = stream.events;
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      this.#open -= 1;
    };
    const terminal = new Set([
      "response.completed",
      "response.failed",
      "response.incomplete",
      "error",
    ]);
    async function* counted(): AsyncGenerator {
      try {
        for await (const event of source) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          const type = (event as { type?: unknown }).type;
          // The stream is done once its terminal event is out, even before the consumer returns.
          if (typeof type === "string" && terminal.has(type)) close();
          yield event;
        }
      } finally {
        close();
      }
    }
    return { requestId: stream.requestId, events: counted() };
  }
}
