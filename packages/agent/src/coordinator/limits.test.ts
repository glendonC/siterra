import { COMMAND_SPEND_CAP_MICRO_USD } from "@siterra/domain";
import { describe, expect, it } from "vitest";

import { P0_LIMITS } from "./limits.ts";

// The host command limits (docs/reference/agent-orchestration.md#budgets). Only a human raises them:
// the wall clock went from 180 s to 300 s on the lead's decision after the package grew (runs of
// 135, 166 and 174.7 s); the spend cap per command and the concurrent model calls did not move.

describe("P0_LIMITS", () => {
  it("allow 300 s a command, 8 tasks, 2 concurrent model calls and the domain's spend cap", () => {
    expect(P0_LIMITS).toEqual({
      maxTasks: 8,
      maxConcurrentModelCalls: 2,
      wallClockMs: 300_000,
      spendCapMicroUsd: COMMAND_SPEND_CAP_MICRO_USD,
    });
  });
});
