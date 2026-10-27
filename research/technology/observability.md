# Observability and trace naming

Checked 2026-10-26. Public research note. Register IDs: TECH-47 to TECH-49 in [feasibility](source-register.md). Nothing was instrumented or exported; recommendations are engineering judgments.

## Verified facts

### OpenTelemetry GenAI semantic conventions

- Moved. The opentelemetry.io GenAI pages (site version "Semantic conventions 1.44.0") now read: "GenAI semantic conventions have moved to the OpenTelemetry GenAI semantic conventions repository. This page has moved and is no longer maintained in this repository." The new home is [open-telemetry/semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai) (created 2026-05-05; last push 2026-10-27 UTC; no tagged releases returned by the GitHub API).
- Status: Development. `docs/gen-ai/README.md` and every span document are marked Development. `model/manifest.yaml` declares `stability: development` and `schema_url: https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev`, depending on core semconv 1.44.0. Names can still change.
- **Span names and kinds** (normative SHOULD):

| Operation | Span name | Kind |
| --- | --- | --- |
| Inference (`gen_ai.client.inference`) | `{gen_ai.operation.name} {gen_ai.request.model}` | CLIENT (INTERNAL for in-process models) |
| Execute tool | `execute_tool {gen_ai.tool.name}` | INTERNAL |
| Invoke agent | `invoke_agent {gen_ai.agent.name}` | CLIENT for remote agents, INTERNAL in-process |
| Invoke workflow | `invoke_workflow {gen_ai.workflow.name}` | INTERNAL |
| Plan | `plan {gen_ai.agent.name}`, or `plan` | INTERNAL |
| Retrieval | `{gen_ai.operation.name} {gen_ai.data_source.id}` | CLIENT |
| Fetch stored response | `{gen_ai.operation.name}` (id is high cardinality) | CLIENT |

- **`gen_ai.operation.name` well-known values:** `chat`, `create_agent`, `create_memory`, `create_memory_store`, `delete_memory`, `delete_memory_store`, `embeddings`, `execute_tool`, `fetch_response`, `generate_content`, `invoke_agent`, `invoke_workflow`, `plan`, `retrieval`, `search_memory`, `text_completion`, `update_memory`, `upsert_memory`. "If one of them applies, then the respective value MUST be used; otherwise, a custom value MAY be used." The non-normative LLM examples use `chat` for OpenAI calls; the OpenAI-specific document adds `openai.api.type` with values `chat_completions` and `responses`.
- **`gen_ai.provider.name` well-known values:** anthropic, aws.bedrock, azure.ai.inference, azure.ai.openai, cohere, deepseek, gcp.gemini, gcp.gen_ai, gcp.vertex_ai, groq, ibm.watsonx.ai, mistral, moonshot_ai, openai, perplexity, x_ai. No Meta value is listed, so a custom value is permitted.
- **Attributes used below:** `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.response.id`, `gen_ai.response.finish_reasons` (string array), `gen_ai.response.status` (`queued`, `in_progress`, `completed`, `incomplete`, `failed`, `cancelled`), `gen_ai.request.max_tokens`, `gen_ai.request.stream`, `gen_ai.request.reasoning.level`, `gen_ai.request.previous_response.id`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.reasoning.output_tokens`, `gen_ai.conversation.id`, `gen_ai.agent.name`, `gen_ai.workflow.name`, `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.type` (`function`, `extension`, `datastore`), `error.type`, `server.address`. Content attributes (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`) exist and are opt-in.
- **Retries:** "If a transient issue happened and the request was retried automatically, the corresponding span SHOULD cover the duration of the logical operation with all retries."

### Langfuse data model ([concepts](https://langfuse.com/docs/observability/data-model), [observation types](https://langfuse.com/docs/observability/features/observation-types), [OpenTelemetry](https://langfuse.com/integrations/native/opentelemetry))

- Observations (individual steps, nestable), traces (observations sharing one `trace_id`; trace-level `user_id`, `session_id`, `tags`, `metadata` copied onto every observation row) and optional sessions grouping traces.
- Observation types: `event`, `span`, `generation`, `agent`, `tool`, `chain`, `retriever`, `evaluator`, `embedding`, `guardrail`.
- OTLP ingestion at `/api/public/otel` over HTTP/JSON or HTTP/protobuf; gRPC is not supported. By default it focuses on LLM-relevant spans, including spans with `gen_ai.*` attributes; `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` map to observation input and output.

### AG-UI ([events](https://docs.ag-ui.com/concepts/events))

Event groups: lifecycle (RunStarted, RunFinished, RunError, StepStarted, StepFinished); text message (Start, Content, End, Chunk); tool call (ToolCallStart, ToolCallArgs, ToolCallEnd, ToolCallResult, ToolCallChunk); state (StateSnapshot, StateDelta as RFC 6902 JSON Patch, MessagesSnapshot); activity (ActivitySnapshot, ActivityDelta); special (Raw, Custom); reasoning; subagent (SubagentStarted, SubagentFinished, SubagentError); deprecated Thinking events; draft Meta events. Wire string values were not checked on that page.

### Meta usage fields that feed the trace (TECH-05, TECH-08)

Responses `usage`: `input_tokens`, `input_tokens_details.cached_tokens`, `output_tokens`, `output_tokens_details.reasoning_tokens`, `total_tokens`. Reasoning tokens are billed as output. Meta's injected steering context is not billed and is excluded from reported usage. Streaming responses always end with usage. Web search is billed per 1,000 queries on top of tokens; the response shows `web_search_call` items, but whether one item equals one billed query was not verified.

## Recommendation (judgment)

1. **Keep the domain event kinds in [data contracts](../../docs/reference/data-contracts.md) as the public trace and SSE contract.** They carry product meaning, ordering and replay; they are not OTel spans and should not be renamed to OTel strings.
2. **Add an internal span record** written by the worker into PostgreSQL in the same transaction style as events (no OTel SDK, no collector in P0). Each domain event may reference a `spanId`. Columns: `traceId` (= commandId), `spanId`, `parentSpanId`, `name`, `kind`, `startedAt`, `endedAt`, `status`, `attributes` (JSONB, allowlisted keys only).
3. **Name spans with OTel GenAI conventions** so a later exporter needs no renaming:

| Siterra unit | Span name | Kind | `gen_ai.operation.name` | Key attributes | Domain events (docs/14) |
| --- | --- | --- | --- | --- | --- |
| Command | `invoke_workflow case_command` | INTERNAL | `invoke_workflow` | `gen_ai.workflow.name=case_command`, `siterra.case_id`, `siterra.command_id` | `command.accepted`, `command.completed` |
| Plan job | `plan coordinator` | INTERNAL | `plan` | `gen_ai.agent.name=coordinator`, `siterra.job_id` | `task.*` |
| Specialist job | `invoke_agent source_research` (one name per job kind) | INTERNAL | `invoke_agent` | `gen_ai.agent.name=<job kind>`, `siterra.job_id`, `siterra.base_revision` | `task.*` |
| Model request | `chat muse-spark-1.3` | CLIENT | `chat` | `gen_ai.provider.name=meta` (custom value), request/response model, `gen_ai.response.id`, `gen_ai.response.status`, `gen_ai.response.finish_reasons`, the four usage counters, `gen_ai.request.reasoning.level`, `gen_ai.request.stream=true`, `gen_ai.request.max_tokens`, `server.address=api.meta.ai`, `siterra.provider.api=responses`, `siterra.web_search.calls`, `siterra.refused`, `siterra.attempts` | `model.started`, `model.completed` |
| Application tool | `execute_tool fetch_source` | INTERNAL | `execute_tool` | `gen_ai.tool.name`, `gen_ai.tool.call.id` (Meta `call_id`), `gen_ai.tool.type=function`, `error.type` | `tool.started`, `tool.completed` |
| Meta built-in `web_search` | no own span (runs inside the provider call) | | | counted on the model span | inside `model.completed` |
| Validation | `siterra.validate <resultKind>` | INTERNAL | none (not a GenAI operation) | `siterra.validation.outcome` | `validation.completed` |
| Commit | `siterra.commit` | INTERNAL | none | `siterra.case_revision` | `case.committed` |

4. **Retries:** one span per logical operation covering all retries (per the spec), with `siterra.attempts`; individual HTTP attempts may be span events.
5. Content stays out. Never set the opt-in content attributes in Siterra's stored spans or any export; store the sanitized argument summary already required by [orchestration](../../docs/reference/agent-orchestration.md). Custom attributes use the `siterra.` prefix.
6. **Pin the convention revision** in code (for example `gen-ai-dev/1.42.0-dev`, checked 2026-10-26) and isolate the mapping in one module, because the conventions are in Development and just changed repositories.
7. **Later export (P1, untested):** translate span rows to OTLP HTTP/JSON and post to Langfuse `/api/public/otel`. Next.js, pg-boss and Vitest list `@opentelemetry/api` only as an optional peer, so P0 needs no OTel dependency.
8. AG-UI: do not adopt in P0. Siterra streams committed domain facts, not token deltas or shared agent state. If an AG-UI client is ever needed, map command to RunStarted/RunFinished/RunError, task to StepStarted/StepFinished, tool events to ToolCallStart/ToolCallEnd/ToolCallResult, and `case.committed` to StateSnapshot or StateDelta.

## Contract gaps found (resolved)

Resolved in case contracts 1.2.0 ([`schemas/case.schema.json`](../../schemas/case.schema.json)): `Event.kind` now includes all seven kinds below, and `ModelUsage` carries `requestId`, `status`, `durationMs`, `reasoningTokens` and `webSearchCalls`. The original findings are kept for the record.

- [data contracts](../../docs/reference/data-contracts.md) lists event kinds `command.completed`, `task.awaiting_input`, `model.started`, `model.completed`, `tool.started`, `validation.completed` and `entity.stale`, but the `Event.kind` enum of the schema at the time omitted all seven.
- The schema's `usage` object lacks the provider request ID, model-call status (`succeeded | refused | incomplete | failed`) and duration that the data contracts say it carries, and has no reasoning-token or web-search-call field, both of which affect Meta billing.
