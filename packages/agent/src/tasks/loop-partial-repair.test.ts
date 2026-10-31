import { describe, expect, it } from "vitest";

import { MetaAdapter } from "../model/adapter.ts";
import { AT } from "../testing/case-fixture.ts";
import { answerStep, refusalStep, syntheticTransport } from "../testing/replay-steps.ts";
import type { ReplayStep } from "../model/replay.ts";
import { runTaskLoop } from "./loop.ts";
import type { LoopOptions } from "./loop.ts";
import type { Checked } from "./validation.ts";

// A partial result the validator marks for repair gets the loop's one repair turn
// (docs/reference/agent-orchestration.md#validation); one it does not mark ends as before.

type Items = string[];

const PROBLEM = { code: "prohibited_claim", path: "$.items[1]", message: "names a tool" } as const;

function loop(
  steps: ReplayStep[],
  results: Checked<Items>[],
  extra: Partial<LoopOptions<Items>> = {},
) {
  const seen: string[] = [];
  let n = 0;
  const promise = runTaskLoop<Items>({
    adapter: new MetaAdapter({
      transport: syntheticTransport(steps),
      sleep: () => Promise.resolve(),
    }),
    request: {
      model: "muse-spark-1.3",
      promptVersion: "test@1",
      instructions: "Return items.",
      output: {
        name: "propose_evidence",
        schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      maxOutputTokens: 1_000,
      reasoningEffort: "low",
    },
    input: [{ kind: "user_text", text: "go" }],
    tools: [],
    validate: (text) => {
      seen.push(text);
      return results[n++] ?? { ok: false, issues: [PROBLEM] };
    },
    taskId: "task_loop_partial",
    trace: { emit: () => undefined },
    now: () => AT,
    ...extra,
  });
  return { promise, seen };
}

const partial = (value: Items, repair: boolean): Checked<Items> => ({
  ok: true,
  value,
  issues: [PROBLEM],
  ...(repair ? { repair: true } : {}),
});
const clean = (value: Items): Checked<Items> => ({ ok: true, value, issues: [] });

describe("task loop, a partial result that asks for repair", () => {
  it("takes one repair turn and returns the repaired value", async () => {
    const { promise, seen } = loop(
      [answerStep("first"), answerStep("second")],
      [partial(["a"], true), clean(["a", "b"])],
    );
    const result = await promise;
    expect(seen).toEqual(["first", "second"]);
    expect(result.repaired).toBe(true);
    expect(result.status).toBe("accepted");
    expect(result.value).toEqual(["a", "b"]);
    expect(result.validation?.outcome).toBe("accepted");
  });

  it("takes no repair turn when the partial result does not ask for one", async () => {
    const { promise, seen } = loop([answerStep("first")], [partial(["a"], false)]);
    const result = await promise;
    expect(seen).toEqual(["first"]);
    expect(result.repaired).toBe(false);
    expect(result.value).toEqual(["a"]);
    expect(result.validation?.outcome).toBe("partial");
  });

  it("repairs once only: a second partial result ends the loop", async () => {
    const { promise, seen } = loop(
      [answerStep("first"), answerStep("second"), answerStep("third")],
      [partial(["a"], true), partial(["a", "b"], true)],
    );
    const result = await promise;
    expect(seen).toEqual(["first", "second"]);
    expect(result.value).toEqual(["a", "b"]);
    expect(result.validation?.outcome).toBe("partial");
  });

  it("returns the first partial value at once when no round is left for the repair", async () => {
    const { promise, seen } = loop([answerStep("first")], [partial(["a"], true)], { maxRounds: 1 });
    const result = await promise;
    expect(seen).toEqual(["first"]);
    expect(result.repaired).toBe(false);
    expect(result.status).toBe("accepted");
    expect(result.value).toEqual(["a"]);
    expect(result.validation?.outcome).toBe("partial");
  });

  it("takes no repair turn for a flagged result that holds no issue", async () => {
    const { promise, seen } = loop(
      [answerStep("first")],
      [{ ok: true, value: ["a"], issues: [], repair: true }],
    );
    const result = await promise;
    expect(seen).toEqual(["first"]);
    expect(result.repaired).toBe(false);
  });

  it("keeps the first partial value when the repair is rejected, refused or fails", async () => {
    const rejected = await loop(
      [answerStep("first"), answerStep("second")],
      [partial(["a"], true), { ok: false, issues: [PROBLEM] }],
    ).promise;
    expect(rejected.status).toBe("accepted");
    expect(rejected.value).toEqual(["a"]);
    expect(rejected.validation?.outcome).toBe("partial");

    const refused = await loop([answerStep("first"), refusalStep()], [partial(["a"], true)])
      .promise;
    expect(refused.status).toBe("accepted");
    expect(refused.value).toEqual(["a"]);
  });

  it("lets the caller prefer the first value over a smaller repaired one", async () => {
    const prefer = (first: Items, repaired: Items): boolean => repaired.length >= first.length;
    const smaller = await loop(
      [answerStep("first"), answerStep("second")],
      [partial(["a", "b"], true), clean(["a"])],
      { keepRepaired: prefer },
    ).promise;
    expect(smaller.value).toEqual(["a", "b"]);
    expect(smaller.validation?.outcome).toBe("partial");

    const equal = await loop(
      [answerStep("first"), answerStep("second")],
      [partial(["a", "b"], true), clean(["c", "d"])],
      { keepRepaired: prefer },
    ).promise;
    expect(equal.value).toEqual(["c", "d"]);
  });

  it("a rejected proposal keeps its repair turn as before", async () => {
    const { promise, seen } = loop(
      [answerStep("first"), answerStep("second")],
      [{ ok: false, issues: [PROBLEM] }, clean(["a"])],
    );
    const result = await promise;
    expect(seen).toEqual(["first", "second"]);
    expect(result.value).toEqual(["a"]);
  });
});
