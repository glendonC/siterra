// A case is "live" only after GATE-01 passed and a spend cap was recorded (lead decision,
// 27 Oct 2026): until then the seed case and every demo copy are "concept". The signal is the one
// the agent's model route uses (packages/agent/src/model/route.ts): SITERRA_LIVE_APPROVED set to
// gate01-passed, which only the lead sets after recording GATE-01.
import type { EnvironmentalCase } from "@siterra/contracts";

export const liveApprovalVariable = "SITERRA_LIVE_APPROVED";
export const liveApprovalValue = "gate01-passed";

export function liveApproved(env: Record<string, string | undefined> = process.env): boolean {
  return env[liveApprovalVariable] === liveApprovalValue;
}

/** The mode a seeded or copied case may carry: live falls back to concept without the approval. */
export function permittedMode(
  mode: EnvironmentalCase["mode"],
  env: Record<string, string | undefined> = process.env,
): EnvironmentalCase["mode"] {
  return mode === "live" && !liveApproved(env) ? "concept" : mode;
}
