import pg from "pg";
import { eventChannel } from "./client.ts";

type Wake = () => void;

/**
 * One LISTEN connection per process that wakes the event streams of a case when a transaction
 * that wrote its events commits. The notification carries only the case ID; streams read the
 * events themselves, so a lost notification delays delivery but never changes it.
 */
export class EventHub {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;
  private retryMs = 0;
  private readonly subscribers = new Map<string, Set<Wake>>();

  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async subscribe(caseId: string, wake: Wake): Promise<() => void> {
    let set = this.subscribers.get(caseId);
    if (set === undefined) {
      set = new Set();
      this.subscribers.set(caseId, set);
    }
    set.add(wake);
    await this.connect();
    return () => {
      const current = this.subscribers.get(caseId);
      current?.delete(wake);
      if (current?.size === 0) {
        this.subscribers.delete(caseId);
      }
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    const client = this.client;
    this.client = null;
    this.connecting = null;
    await client?.end();
  }

  private connect(): Promise<void> {
    if (this.client !== null) {
      return Promise.resolve();
    }
    this.connecting ??= (async () => {
      const client = new pg.Client({ connectionString: this.connectionString });
      client.on("notification", (message) => {
        if (message.channel === eventChannel && message.payload !== undefined) {
          this.wakeCase(message.payload);
        }
      });
      client.on("error", () => {
        this.client = null;
        this.connecting = null;
        client.end().catch(() => undefined);
        // Streams re-read the log now, then the hub listens again, so live delivery resumes
        // without waiting for the next heartbeat.
        for (const caseId of this.subscribers.keys()) {
          this.wakeCase(caseId);
        }
        this.reconnectLater();
      });
      await client.connect();
      await client.query(`listen ${eventChannel}`);
      this.client = client;
      this.retryMs = 0;
    })().catch((error: unknown) => {
      this.connecting = null;
      throw error;
    });
    return this.connecting;
  }

  /** Reconnects while streams are subscribed, waiting 1 s, then doubling up to 15 s. */
  private reconnectLater(): void {
    if (this.closed || this.subscribers.size === 0) {
      return;
    }
    this.retryMs = Math.min(this.retryMs === 0 ? 1000 : this.retryMs * 2, 15_000);
    setTimeout(() => {
      if (this.closed || this.client !== null) {
        return;
      }
      this.connect().then(
        () => {
          for (const caseId of this.subscribers.keys()) {
            this.wakeCase(caseId);
          }
        },
        () => {
          this.reconnectLater();
        },
      );
    }, this.retryMs);
  }

  private wakeCase(caseId: string): void {
    for (const wake of this.subscribers.get(caseId) ?? []) {
      wake();
    }
  }
}
