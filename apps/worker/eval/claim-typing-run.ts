// `node apps/worker/eval/claim-typing-run.ts`: one claim typing run over the extraction gold set,
// on the route SITERRA_MODEL_ROUTE names (replay by default, which needs SITERRA_REPLAY_FILE; the
// live route needs its approval value and the login Keychain key, which this script never prints).
// Spend stops at EVAL_CAP_MICRO_USD (default 500000). Writes eval-reports/eval-claim-typing-<date>.json
// and .md. Every figure is scored against unsigned model drafts.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CommandSpend,
  MetaAdapter,
  chooseTransport,
  describeRoute,
  readKeychainKey,
} from "@siterra/agent";

import {
  claimTypingMarkdown,
  parseCapMicroUsd,
  runClaimTyping,
  scoreClaimTyping,
} from "./claim-typing.ts";
import { loadExtractionGold } from "./gold.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const gold = loadExtractionGold(join(repoDir, "data/case/gold/extraction.jsonl"));
// Parsed first: a bad cap stops the run before the Keychain is read or a model is called.
const capMicro = parseCapMicroUsd(process.env["EVAL_CAP_MICRO_USD"], 500_000);
const transport = chooseTransport(process.env, { readKeychain: (s) => readKeychainKey(s) });
const route = describeRoute(transport);
const model = process.env["EVAL_MODEL"] ?? "muse-spark-1.3";
const spend = new CommandSpend(capMicro);
const adapter = new MetaAdapter({ transport, spend });
const events: unknown[] = [];
const now = () => new Date();
const run = await runClaimTyping(gold.items, {
  adapter,
  model,
  trace: { emit: (e) => events.push(e) },
  now,
  signal: new AbortController().signal,
});
const score = scoreClaimTyping(gold.items, run.labels);
const calls = run.calls.map((c) => ({
  status: c.status,
  model: c.model,
  route: c.route,
  replayOrigin: c.replayOrigin,
  providerRequestId: c.providerRequestId,
  providerResponseId: c.providerResponseId,
  inputTokens: c.usage.inputTokens,
  outputTokens: c.usage.outputTokens,
  reasoningTokens: c.usage.reasoningTokens,
  costUsd: c.costEstimateUsd,
  durationMs: c.durationMs,
  errorCode: c.errorCode,
}));
const costUsd = calls.some((c) => c.costUsd === null)
  ? null
  : calls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
const date = now().toISOString();
const header = {
  label: process.env["EVAL_RUN_LABEL"] ?? "Eval claim typing",
  route: route.label,
  model,
  promptVersion: "eval_claim_typing@1",
  capUsd: capMicro / 1_000_000,
  date,
};
const out = join(repoDir, "eval-reports");
mkdirSync(out, { recursive: true });
const stamp = date.replaceAll(":", "").replace(/\..*$/, "");
const md = claimTypingMarkdown(score, run, { route: route.label, model, date, costUsd });
writeFileSync(
  join(out, `eval-claim-typing-${stamp}.json`),
  JSON.stringify(
    { header, status: run.status, firstPass: run.firstPass, costUsd, calls, score },
    null,
    2,
  ),
);
writeFileSync(join(out, `eval-claim-typing-${stamp}.md`), md);
console.log(md);
console.log(JSON.stringify({ calls, costUsd }, null, 2));
process.exit(run.status === "accepted" ? 0 : 1);
