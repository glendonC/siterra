import { assertStrictSubset } from "./strict-schema.ts";
import type { ResponsesBody } from "./transport.ts";
import type { InputItem, ModelRequest } from "./types.ts";

// Adapter rules from docs/architecture/02-architecture-constraints.md#model-platform:
// store false with encrypted reasoning, strict json_schema output, tool_choice auto, streamed.

function inputItems(input: readonly InputItem[]): unknown[] {
  const items: unknown[] = [];
  for (const item of input) {
    switch (item.kind) {
      case "user_text":
        items.push({ role: "user", content: [{ type: "input_text", text: item.text }] });
        break;
      case "replay":
        items.push(...item.items);
        break;
      case "tool_output":
        items.push({ type: "function_call_output", call_id: item.callId, output: item.output });
        break;
    }
  }
  return items;
}

/** Builds the Responses body. Throws `StrictSchemaError` before any call if a schema is outside the subset. */
export function buildResponsesBody(request: ModelRequest): ResponsesBody {
  assertStrictSubset(request.output.name, request.output.schema);
  for (const tool of request.tools) assertStrictSubset(tool.name, tool.parameters);
  const body: ResponsesBody = {
    model: request.model,
    store: false,
    include: ["reasoning.encrypted_content"],
    stream: true,
    instructions: request.instructions,
    input: inputItems(request.input),
    reasoning: { effort: request.reasoningEffort },
    max_output_tokens: request.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: request.output.name,
        schema: request.output.schema,
        strict: true,
      },
    },
  };
  if (request.tools.length > 0) {
    body["tools"] = request.tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: true,
    }));
    body["tool_choice"] = "auto";
  }
  return body;
}
