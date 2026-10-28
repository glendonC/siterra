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
