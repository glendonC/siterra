import { describe, expect, it } from "vitest";

import { ReplayError, ReplayTransport, parseReplayFile } from "./replay.ts";
import type { ResponsesBody } from "./transport.ts";

// Matched replay steps: chosen by instructions, input and turn rather than by order, and never used
// up. Synthetic steps only.

const signal = new AbortController().signal;

function step(id: string, match: unknown) {
  return { kind: "stream", requestId: id, events: [], match };
}

function body(instructions: string, question: string, toolOutputs: number): ResponsesBody {
  const input: unknown[] = [
    { role: "user", content: [{ type: "input_text", text: `Question: ${question}` }] },
  ];
  for (let i = 0; i < toolOutputs; i += 1)
    input.push({ type: "function_call_output", call_id: `c${i}`, output: "{}" });
  return { model: "muse-spark-1.3", instructions, input };
}

const file = parseReplayFile({
  format: "siterra-model-replay@1",
  origin: "synthetic",
  model: "muse-spark-1.3",
  description: "Synthetic matched steps.",
  steps: [
    step("plan", { instructionsPrefix: "You plan", inputIncludes: null, turn: 0 }),
    step("veg-0", { instructionsPrefix: "You answer", inputIncludes: "NDVI", turn: 0 }),
    step("veg-1", { instructionsPrefix: "You answer", inputIncludes: "NDVI", turn: 1 }),
    step("rain-0", { instructionsPrefix: "You answer", inputIncludes: "rainfall", turn: 0 }),
  ],
});

describe("matched replay steps", () => {
  it("answers by instructions, input and turn, in any order and as often as asked", async () => {
    const t = new ReplayTransport(file);
    const ids = [];
    for (const b of [
      body("You answer one question", "rainfall?", 0),
      body("You answer one question", "NDVI?", 1),
      body("You plan one command", "x", 0),
      body("You answer one question", "NDVI?", 0),
      body("You plan one command", "y", 0),
    ]) {
      ids.push((await t.open(b, signal)).requestId);
    }
    expect(ids).toEqual(["rain-0", "veg-1", "plan", "veg-0", "plan"]);
  });

  it("refuses a request no step matches", async () => {
    const t = new ReplayTransport(file);
    await expect(
      t.open(body("You answer one question", "rainfall?", 1), signal),
    ).rejects.toBeInstanceOf(ReplayError);
  });

  it("refuses a match without a whole turn number", () => {
    expect(() =>
      parseReplayFile({
        format: "siterra-model-replay@1",
        origin: "synthetic",
        model: "m",
        description: "",
        steps: [step("x", { turn: -1 })],
      }),
    ).toThrow(ReplayError);
  });
});
