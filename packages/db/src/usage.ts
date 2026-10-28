// Model usage of a case (TR-06): per route, provider, model and replay origin, summed from the
// provider usage stored on model.completed events (model.started carries no counts). Replayed calls
// cost nothing and are summed apart from live calls, so the two are never mixed.
import { type ModelUsage, UsageResponse, type UsageRow } from "@siterra/contracts";
import type { Pool } from "./client.ts";

/** The case's model usage, or null when the case is not this owner's. */
export async function readUsage(
  pool: Pool,
  args: { caseId: string; ownerScopeId: string },
): Promise<UsageResponse | null> {
  const owned = await pool.query("select 1 from cases where id = $1 and owner_scope_id = $2", [
    args.caseId,
    args.ownerScopeId,
  ]);
  if (owned.rowCount === 0) return null;
  const events = await pool.query<{ usage: ModelUsage | null }>(
    `select record->'usage' as usage from events
     where case_id = $1 and kind = 'model.completed' order by sequence`,
    [args.caseId],
  );
  const rows = new Map<string, UsageRow>();
  for (const { usage } of events.rows) {
    if (usage === null) continue;
    const route = usage.provider === "replay" ? "replay" : "live";
    const replayOrigin = route === "replay" ? (usage.replayOrigin ?? null) : null;
    const key = JSON.stringify([route, usage.provider, usage.model, replayOrigin]);
    const row = rows.get(key) ?? {
      route,
      provider: usage.provider,
      model: usage.model,
      replayOrigin,
      calls: 0,
      unsuccessfulCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      callsWithoutTokens: 0,
      estimatedCostMicroUsd: 0,
      callsWithoutCost: 0,
    };
    row.calls += 1;
    if (usage.status !== "succeeded") row.unsuccessfulCalls += 1;
    if (usage.inputTokens === null && usage.outputTokens === null) {
      row.callsWithoutTokens += 1;
    } else {
      row.inputTokens += usage.inputTokens ?? 0;
      row.outputTokens += usage.outputTokens ?? 0;
      row.cachedInputTokens += usage.cachedInputTokens ?? 0;
      row.reasoningTokens += usage.reasoningTokens ?? 0;
    }
    if (route === "live") {
      if (usage.estimatedCostMicroUsd === null) row.callsWithoutCost += 1;
      else row.estimatedCostMicroUsd += usage.estimatedCostMicroUsd;
    }
    rows.set(key, row);
  }
  const all = [...rows.values()].sort(
    (a, b) =>
      a.route.localeCompare(b.route) ||
      a.provider.localeCompare(b.provider) ||
      a.model.localeCompare(b.model) ||
      (a.replayOrigin ?? "").localeCompare(b.replayOrigin ?? ""),
  );
  const live = all.filter((r) => r.route === "live");
  return UsageResponse.parse({
    caseId: args.caseId,
    costIsEstimate: true,
    live: {
      calls: live.reduce((n, r) => n + r.calls, 0),
      estimatedCostMicroUsd: live.reduce((n, r) => n + r.estimatedCostMicroUsd, 0),
    },
    replay: {
      calls: all.filter((r) => r.route === "replay").reduce((n, r) => n + r.calls, 0),
    },
    rows: all,
  });
}
