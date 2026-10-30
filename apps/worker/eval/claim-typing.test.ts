import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CommandSpend,
  MetaAdapter,
  ReplayTransport,
  parseReplayFile,
  strictSubsetIssues,
} from "@siterra/agent";
import type { ReplayStep } from "@siterra/agent";
import { describe, expect, it } from "vitest";

import {
  CLAIM_KINDS,
  checkClaimAnswer,
  claimTypingListing,
  claimTypingMarkdown,
  claimTypingSchema,
  MAX_CAP_MICRO_USD,
  parseCapMicroUsd,
  runClaimTyping,
  scoreClaimTyping,
} from "./claim-typing.ts";
import { loadExtractionGold } from "./gold.ts";
import type { ExtractionItem } from "./gold.ts";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const MODEL = "muse-spark-1.3";

function item(id: string, claimKind = "scientific_context"): ExtractionItem {
  return {
    id,
    source_id: "SCI-99",
    page: 1,
    snapshot_sha256: null,
    text_sha256: null,
    char_offset: null,
    char_length: null,
    excerpt: "x",
    excerpt_sha256: "0".repeat(64),
    claim_kind: claimKind,
    statement: `A synthetic source reports ${id}.`,
    scope: "A synthetic place",
    file: "paper.pdf",
    signed_by: null,
  };
}

function answerStep(text: string, n: number): ReplayStep {
  return {
    kind: "stream",
    requestId: `req_synthetic_claims_${String(n)}`,
    events: [
      { type: "response.created", response: { id: `resp_${String(n)}`, status: "in_progress" } },
      { type: "response.output_text.delta", delta: text },
      {
        type: "response.completed",
        response: {
          id: `resp_${String(n)}`,
          status: "completed",
          output: [
            { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
          ],
          usage: {
            input_tokens: 900,
            output_tokens: 300,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 100 },
          },
        },
      },
    ],
  };
}

function adapterWith(...answers: unknown[]): MetaAdapter {
  const transport = new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model: MODEL,
      description: "Synthetic claim typing answers built in a test.",
      steps: answers.map((a, i) => answerStep(JSON.stringify(a), i + 1)),
    }),
  );
  return new MetaAdapter({ transport });
}

const deps = (adapter: MetaAdapter) => ({
  adapter,
  model: MODEL,
  trace: { emit: () => undefined },
  now: () => new Date("2026-10-29T20:00:00Z"),
});

const labels = (pairs: [string, string][]) => ({
  labels: pairs.map(([id, claimKind]) => ({ id, claimKind })),
});

describe("claim typing suite", () => {
  it("lists the seven kinds of the case schema, and its answer schema is in the strict subset", () => {
    const schema = JSON.parse(readFileSync(join(repoDir, "schemas/case.schema.json"), "utf8")) as {
      $defs: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
    };
    const defs = schema.$defs;
    const claimKind = (defs["Evidence"] as { properties: Record<string, { enum?: string[] }> })
      .properties["claimKind"];
    expect([...CLAIM_KINDS]).toEqual(claimKind?.enum);
    expect(strictSubsetIssues(claimTypingSchema())).toEqual([]);
  });

  it("shows the model the id, statement and scope of each item, never the label or the labeler", () => {
    const listing = claimTypingListing([item("gx-1", "hypothesis")]);
    expect(JSON.parse(listing)).toEqual([
      { id: "gx-1", statement: "A synthetic source reports gx-1.", scope: "A synthetic place" },
    ]);
    expect(listing).not.toContain("hypothesis");
  });

  it("scores a valid first answer against the draft labels and builds the confusion matrix", async () => {
    const items = [item("a"), item("b"), item("c", "hypothesis")];
    const run = await runClaimTyping(
      items,
      deps(
        adapterWith(
          labels([
            ["a", "scientific_context"],
            ["b", "observation"],
            ["c", "hypothesis"],
          ]),
        ),
      ),
    );
    expect(run).toMatchObject({ status: "accepted", firstPass: true });
    const score = scoreClaimTyping(items, run.labels);
    expect(score).toMatchObject({
      items: 3,
      answered: 3,
      correct: 2,
      scoredAgainst: "unsigned model drafts",
    });
    expect(score.accuracy).toBeCloseTo(2 / 3);
    expect(score.confusion).toEqual({
      scientific_context: { scientific_context: 1, observation: 1 },
      hypothesis: { hypothesis: 1 },
    });
    expect(score.wrong).toEqual([
      { id: "b", gold: "scientific_context", predicted: "observation" },
    ]);
  });

  it("repairs an answer that misses an id and reports that the first pass failed", async () => {
    const items = [item("a"), item("b")];
    const run = await runClaimTyping(
      items,
      deps(
        adapterWith(
          labels([["a", "scientific_context"]]),
          labels([
            ["a", "scientific_context"],
            ["b", "scientific_context"],
          ]),
        ),
      ),
    );
    expect(run).toMatchObject({ status: "accepted", firstPass: false });
    expect(run.labels.size).toBe(2);
  });

  it("does not accept an id the model was not given, or one labelled twice, on the first pass", async () => {
    const items = [item("a")];
    const good = labels([["a", "scientific_context"]]);
    const unknown = await runClaimTyping(
      items,
      deps(
        adapterWith(
          labels([
            ["a", "scientific_context"],
            ["zz", "observation"],
          ]),
          good,
        ),
      ),
    );
    expect(unknown).toMatchObject({ status: "accepted", firstPass: false });
    const twice = await runClaimTyping(
      items,
      deps(
        adapterWith(
          labels([
            ["a", "scientific_context"],
            ["a", "observation"],
          ]),
          good,
        ),
      ),
    );
    expect(twice).toMatchObject({ status: "accepted", firstPass: false });
    expect(twice.labels.get("a")).toBe("scientific_context");
  });

  it("answers nothing, and scores nothing, when the answer stays invalid", async () => {
    const items = [item("a")];
    const bad = labels([["a", "not_a_kind"]]);
    const run = await runClaimTyping(items, deps(adapterWith(bad, bad)));
    expect(run.status).not.toBe("accepted");
    expect(run.labels.size).toBe(0);
    expect(scoreClaimTyping(items, run.labels)).toMatchObject({
      answered: 0,
      accuracy: null,
    });
  });

  it("counts an unanswered item as unanswered, not as wrong", () => {
    const score = scoreClaimTyping(
      [item("a"), item("b")],
      new Map([["a", "scientific_context" as const]]),
    );
    expect(score).toMatchObject({ items: 2, answered: 1, correct: 1, wrong: [] });
  });

  it("says in the report that agreement is with unsigned drafts and that one kind cannot test the others", () => {
    const score = scoreClaimTyping([item("a")], new Map([["a", "scientific_context" as const]]));
    const text = claimTypingMarkdown(
      score,
      { status: "accepted", firstPass: true },
      {
        route: "Replay (synthetic), not a live model call",
        model: MODEL,
        date: "2026-10-29",
        costUsd: 0,
      },
    );
    expect(text).toContain("Scored against unsigned model drafts");
    expect(text).toContain("not accuracy against gold");
    expect(text).toContain("single kind");
  });

  it("makes no call, and answers nothing, once the spend cap cannot cover it", async () => {
    const transport = new ReplayTransport(
      parseReplayFile({
        format: "siterra-model-replay@1",
        origin: "synthetic",
        model: MODEL,
        description: "Synthetic claim typing answer built in a test.",
        steps: [answerStep(JSON.stringify(labels([["a", "scientific_context"]])), 1)],
      }),
    );
    const run = await runClaimTyping(
      [item("a")],
      deps(new MetaAdapter({ transport, spend: new CommandSpend(1) })),
    );
    expect(run.status).not.toBe("accepted");
    expect(run.labels.size).toBe(0);
    expect(transport.opened).toHaveLength(0);
  });

  it("names an id with no label even when it is a prefix of an id that has an issue", () => {
    const result = checkClaimAnswer(
      JSON.stringify(
        labels([
          ["ab", "scientific_context"],
          ["ab", "observation"],
        ]),
      ),
      ["a", "ab"],
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message)).toContain("a has no label.");
  });

  it("takes the spend cap as a whole number in range, or the default, and refuses anything else", () => {
    expect(parseCapMicroUsd(undefined, 500_000)).toBe(500_000);
    expect(parseCapMicroUsd("250000", 500_000)).toBe(250_000);
    expect(parseCapMicroUsd("1", 500_000)).toBe(1);
    expect(parseCapMicroUsd(String(MAX_CAP_MICRO_USD), 500_000)).toBe(MAX_CAP_MICRO_USD);
    for (const bad of [
      "abc",
      "",
      "0",
      "-5",
      "1.5",
      "1e6",
      " 5",
      "0x10",
      "500001",
      "NaN",
      "Infinity",
      "500,000",
    ]) {
      expect(() => parseCapMicroUsd(bad, 500_000), bad).toThrow(/EVAL_CAP_MICRO_USD/);
    }
  });

  it("loads the case's gold with a statement and scope for every item", () => {
    const gold = loadExtractionGold(join(repoDir, "data/case/gold/extraction.jsonl"));
    expect(gold.items).toHaveLength(32);
    expect(gold.items.every((i) => i.statement.length > 0 && i.scope.length > 0)).toBe(true);
  });
});
