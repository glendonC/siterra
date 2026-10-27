---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Use domain events as the public trace

## Context and Problem Statement

Users and reviewers need to see what Siterra did: tasks, model calls, tool calls, validation outcomes and commits, with timings and usage, and without raw prompts, keys or hidden reasoning. The same events drive the stream that updates the workspace. What should the trace be built on?

## Considered Options

* Domain events as the public trace, with internal span rows named after the OpenTelemetry GenAI conventions
* The OpenTelemetry SDK and a collector from the start
* A hosted LLM observability store such as Langfuse
* AG-UI events as the stream protocol

## Decision Outcome

Chosen option: "Domain events as the public trace, with internal span rows named after the OpenTelemetry GenAI conventions", because domain events already carry product meaning, ordering and replay, and need no extra infrastructure.

The event kinds in [Data contracts](../reference/data-contracts.md#events) are the trace and the stream contract, and host templates write event messages, never the model. The worker also writes span rows in PostgreSQL (trace = command; spans for workflow, plan, task, model call, tool call, validation and commit) with names the conventions prescribe, such as `chat <model>` and `execute_tool compare_series`, so a later exporter needs no renaming. Content attributes (prompts, messages, tool arguments) are never stored. Details: [Cross-cutting concepts](../architecture/08-cross-cutting-concepts.md#trace) and [observability research](../../research/technology/observability.md).

### Consequences

* Good, because milestones in the trace are counts of real events, never narrated progress.
* Good, because P0 needs no OpenTelemetry dependency, collector or observability account.
* Bad, because the GenAI conventions have Development status and moved to their own repository (TECH-47), so names can change; the convention revision is pinned in one module.
* Bad, because export to an external tool is later work (P1) and untested.

### Confirmation

TR-02 (trace content), TR-03 (trace hygiene) and RL-03 (stream replay without duplicates or gaps) in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

### The OpenTelemetry SDK and a collector from the start

* Bad, because it adds infrastructure with no P0 use; Next.js, pg-boss and Vitest list `@opentelemetry/api` only as an optional peer.

### A hosted LLM observability store such as Langfuse

* Neutral, because it ingests OTLP over HTTP (TECH-48) and remains an optional later destination for the span rows.

### AG-UI events as the stream protocol

* Bad, because Siterra streams committed domain facts, not token deltas or shared agent state (TECH-49).
