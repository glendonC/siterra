import { COMMAND_SPEND_CAP_MICRO_USD } from "@siterra/domain";

import type { SpendGuard } from "../model/adapter.ts";

// Host-enforced command limits (docs/reference/agent-orchestration.md#budgets). Only a human can
// raise them; nothing a model returns changes them.

export interface CommandLimits {
  maxTasks: number;
  maxConcurrentModelCalls: number;
  wallClockMs: number;
  spendCapMicroUsd: number;
}

export const P0_LIMITS: CommandLimits = {
  maxTasks: 8,
  maxConcurrentModelCalls: 2,
  wallClockMs: 300_000,
  spendCapMicroUsd: COMMAND_SPEND_CAP_MICRO_USD,
};

/** A counting semaphore: at most `size` holders at once, served in arrival order. */
export class Semaphore {
  readonly #size: number;
  #held = 0;
  #peak = 0;
  readonly #waiting: (() => void)[] = [];

  constructor(size: number) {
    this.#size = size;
  }

  /** The most holders seen at once, for tests and the trace. */
  get peak(): number {
    return this.#peak;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#held >= this.#size) {
      // A releasing holder hands its slot straight to the first waiter, so `held` stays put.
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    } else {
      this.#held += 1;
    }
    this.#peak = Math.max(this.#peak, this.#held);
    try {
      return await fn();
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#held -= 1;
    }
  }
}

/**
 * The per-command spend ledger. Each attempt reserves its worst case; settling replaces the
 * reservation with the estimate computed from reported usage, or keeps it when usage is unknown.
 */
export class CommandSpend implements SpendGuard {
  readonly capUsd: number;
  #committedUsd = 0;
  #reservedUsd = 0;
  #refused = false;

  /** `spentMicroUsd`: what the command spent before this run, a resumed one (AF-03). */
  constructor(capMicroUsd: number, spentMicroUsd = 0) {
    this.capUsd = capMicroUsd / 1_000_000;
    this.#committedUsd = spentMicroUsd / 1_000_000;
  }

  get spentUsd(): number {
    return this.#committedUsd;
  }

  /** True once a reservation was refused: the command stops starting new work. */
  get exhausted(): boolean {
    return this.#refused;
  }

  reserve(usd: number): boolean {
    if (this.#committedUsd + this.#reservedUsd + usd > this.capUsd) {
      this.#refused = true;
      return false;
    }
    this.#reservedUsd += usd;
    return true;
  }

  settle(reservedUsd: number, estimateUsd: number | null): void {
    this.#reservedUsd = Math.max(0, this.#reservedUsd - reservedUsd);
    this.#committedUsd += estimateUsd ?? reservedUsd;
  }
}
