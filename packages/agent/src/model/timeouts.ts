/** A stream that produced no first event, or went quiet, within its deadline. */
export class StreamTimeout extends Error {
  readonly code: "first_event_timeout" | "idle_timeout";

  constructor(code: "first_event_timeout" | "idle_timeout") {
    super(code);
    this.name = "StreamTimeout";
    this.code = code;
  }
}

export interface StreamDeadlines {
  firstEventMs: number;
  idleMs: number;
}

/** P0 defaults from the budgets table in docs/reference/agent-orchestration.md. */
export const DEFAULT_DEADLINES: StreamDeadlines = { firstEventMs: 20_000, idleMs: 30_000 };

/**
 * Yields the source's events, throwing `StreamTimeout` when the first event or any later event
 * takes longer than its deadline. There is no total timeout: a stream that keeps sending runs on.
 * `onTimeout` runs before the throw so the caller can abort the underlying request.
 */
export async function* withDeadlines<T>(
  source: AsyncIterable<T>,
  deadlines: StreamDeadlines,
  onTimeout: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  let first = true;
  try {
    for (;;) {
      const ms = first ? deadlines.firstEventMs : deadlines.idleMs;
      const code = first ? "first_event_timeout" : "idle_timeout";
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => {
          resolve("timeout");
        }, ms);
      });
      const next = await Promise.race([iterator.next(), timeout]);
      clearTimeout(timer);
      if (next === "timeout") {
        onTimeout();
        throw new StreamTimeout(code);
      }
      if (next.done === true) return;
      first = false;
      yield next.value;
    }
  } finally {
    void iterator.return?.();
  }
}
