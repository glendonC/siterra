import type { Event, StreamReset } from "@siterra/contracts";
import { type EventHub, type Pool, eventsAfter } from "@siterra/db";

/** Heartbeat comment interval; Railway closes a stream after 5 idle minutes (constraints, hosting limits). */
export const heartbeatMs = 15_000;
const pageSize = 500;
const encoder = new TextEncoder();

/**
 * The stream cursor: Last-Event-ID takes precedence over ?after= because EventSource reconnects with
 * the original URL (data-contracts.md, HTTP API and event stream). "invalid" for anything but a
 * non-negative integer.
 */
export function streamCursor(request: Request): number | "invalid" {
  const raw =
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after");
  if (raw === null || raw === "") {
    return 0;
  }
  return /^(0|[1-9][0-9]{0,15})$/.test(raw) ? Number(raw) : "invalid";
}

export function eventMessage(event: Event): string {
  return `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function resetMessage(): string {
  const body: StreamReset = { reason: "history_unavailable" };
  return `event: reset\ndata: ${JSON.stringify(body)}\n\n`;
}

/**
 * Persisted events after the cursor in sequence order, then each new event as its transaction
 * commits. A cursor beyond the case's last sequence cannot be replayed: one reset message, then
 * the stream closes. Every heartbeat also re-reads the log, so a lost notification costs at most
 * one heartbeat interval.
 */
export function caseEventStream(args: {
  pool: Pool;
  hub: EventHub;
  caseId: string;
  after: number;
  lastSequence: number;
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  const { pool, hub, caseId, signal } = args;
  let cursor = args.after;
  let closed = false;
  let pumping = false;
  let again = false;
  // Read through functions: the flags change across awaits, which narrowing cannot see.
  const isClosed = () => closed;
  const wakeArrived = () => again;
  let unsubscribe: () => void = () => undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(timer);
    unsubscribe();
    try {
      controllerRef?.close();
    } catch {
      // Already closed by the consumer.
    }
  };

  const send = (text: string) => {
    if (!closed) {
      controllerRef?.enqueue(encoder.encode(text));
    }
  };

  const pump = async (): Promise<void> => {
    if (pumping) {
      again = true;
      return;
    }
    pumping = true;
    try {
      do {
        again = false;
        for (;;) {
          const events = await eventsAfter(pool, caseId, cursor, pageSize);
          for (const event of events) {
            if (isClosed()) {
              return;
            }
            send(eventMessage(event));
            cursor = event.sequence;
          }
          if (events.length < pageSize) {
            break;
          }
        }
      } while (wakeArrived() && !isClosed());
    } catch (error) {
      if (!isClosed()) {
        closed = true;
        clearInterval(timer);
        unsubscribe();
        controllerRef?.error(error);
      }
    } finally {
      pumping = false;
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      if (args.after > args.lastSequence) {
        send(resetMessage());
        close();
        return;
      }
      signal.addEventListener("abort", close, { once: true });
      unsubscribe = await hub.subscribe(caseId, () => {
        void pump();
      });
      timer = setInterval(() => {
        send(": heartbeat\n\n");
        void pump();
      }, heartbeatMs);
      await pump();
    },
    cancel() {
      close();
    },
  });
}
