import type { InstanceSpendPolicy } from "@siterra/db";
import { COMMAND_SPEND_CAP_MICRO_USD } from "@siterra/domain";

// Demo session settings, read from the environment with conservative defaults. The quotas bound
// what an anonymous visitor can spend on model calls; changing them is the founder's decision.
function intSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

export function demoConfig() {
  return {
    seedCaseId: process.env["SITERRA_SEED_CASE_ID"] ?? "case_aitbouguemez",
    seedOwnerScopeId: process.env["SITERRA_SEED_OWNER_SCOPE"] ?? "seed",
    ttlSeconds: intSetting("SITERRA_DEMO_TTL_SECONDS", 24 * 60 * 60),
    maxActiveSessions: intSetting("SITERRA_DEMO_MAX_ACTIVE", 50),
    maxPerMinute: intSetting("SITERRA_DEMO_MAX_PER_MINUTE", 10),
    commandQuota: intSetting("SITERRA_DEMO_COMMAND_QUOTA", 20),
  };
}

/**
 * This instance's cap on live model spend (SITERRA_PUBLIC_SPEND_CAP_MICRO_USD, in micro-USD,
 * counted from stored usage at list price). Unset: no cap. A new command is refused once the stored
 * spend, one command's cap for every unfinished command and its own would pass it.
 */
export function instanceSpendPolicy(): InstanceSpendPolicy {
  const cap = process.env["SITERRA_PUBLIC_SPEND_CAP_MICRO_USD"];
  return {
    capMicroUsd:
      cap === undefined || cap === "" ? null : intSetting("SITERRA_PUBLIC_SPEND_CAP_MICRO_USD", 0),
    perCommandMicroUsd: COMMAND_SPEND_CAP_MICRO_USD,
  };
}
