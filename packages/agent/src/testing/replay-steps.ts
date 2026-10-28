import { parseReplayFile, ReplayTransport } from "../model/replay.ts";
import type { ReplayStep } from "../model/replay.ts";

// Builders for synthetic replay steps in tests. Every step they build is synthetic and is
// labeled so by the replay file; none is a recording of a provider.

let counter = 0;

const usage = {
  input_tokens: 900,
  output_tokens: 300,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 120 },
};

/** A stream that ends with `text` as the structured final output. */
export function answerStep(text: string): ReplayStep {
  counter += 1;
  const id = `resp_synthetic_answer_${counter}`;
  return {
    kind: "stream",
    requestId: `req_synthetic_answer_${counter}`,
    events: [
      { type: "response.created", response: { id, status: "in_progress" } },
      { type: "response.output_text.delta", delta: text },
      {
        type: "response.completed",
        response: {
          id,
          status: "completed",
          output: [
            { type: "reasoning", summary: [], encrypted_content: `synthetic-encrypted-${counter}` },
            { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
          ],
          usage,
        },
      },
    ],
  };
}

/** A stream that ends with one function call. */
export function toolCallStep(name: string, args: unknown): ReplayStep {
  counter += 1;
  const id = `resp_synthetic_tool_${counter}`;
  const call = {
    type: "function_call",
    call_id: `call_synthetic_${counter}`,
    name,
    arguments: JSON.stringify(args),
  };
  return {
    kind: "stream",
    requestId: `req_synthetic_tool_${counter}`,
    events: [
      { type: "response.created", response: { id, status: "in_progress" } },
      { type: "response.output_item.done", item: call },
      {
        type: "response.completed",
        response: {
          id,
          status: "completed",
          output: [
            { type: "reasoning", summary: [], encrypted_content: `synthetic-encrypted-${counter}` },
            call,
          ],
          usage,
        },
      },
    ],
  };
}

export function refusalStep(): ReplayStep {
  counter += 1;
  return {
    kind: "stream",
    requestId: null,
    events: [
      { type: "response.refusal.done", refusal: "I can't help with that." },
      {
        type: "response.completed",
        response: {
          id: `resp_synthetic_refusal_${counter}`,
          status: "completed",
          output: [],
          usage,
        },
      },
    ],
  };
}

export function syntheticTransport(steps: ReplayStep[], model = "muse-spark-1.3"): ReplayTransport {
  return new ReplayTransport(
    parseReplayFile({
      format: "siterra-model-replay@1",
      origin: "synthetic",
      model,
      description: "Synthetic steps built in a test.",
      steps,
    }),
  );
}
