---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Use a Meta model through the Responses API

## Context and Problem Statement

Planning, source reading, hypothesis comparison and layout proposals need a reasoning model with strict structured output and tool calling. The event rules require building with Meta AI products and weight use of Meta AI tooling at 25% (TECH-29). Meta's Model API serves the same models at the same price through Responses, Chat Completions and Messages endpoints (TECH-04). Which model and API should Siterra use?

## Considered Options

* `muse-spark-1.3` in Standard mode on the Responses API
* The same model on Chat Completions
* Muse Spark Open through a documented hosting provider
* The Llama API
* A model from another provider

## Decision Outcome

Chosen option: "`muse-spark-1.3` in Standard mode on the Responses API", because it is Meta's recommended model and API for new work, Responses is the only format with search grounding and cross-turn reasoning replay for OpenAI-style clients, and the platform facts were checked in Meta's documentation (TECH-03 to TECH-10, TECH-30 to TECH-34).

Every request sends `store: false` with encrypted reasoning replay and uses strict structured output. Meta capabilities by priority: PDF input for source reading (P0), image input for imagery quality review (P1), Muse Voice Transcribe (P1 stretch), search grounding (P1) and Segment Anything (P2); each one carries a deterministic cross-check or is not built ([Architecture constraints](../architecture/02-architecture-constraints.md#meta-capabilities-used)).

### Consequences

* Good, because PDF input lets the model read French-language sources in context, with every excerpt verified against the extracted text.
* Good, because Standard-mode content is not used for training.
* Bad, because account access is unverified until GATE-01 passes. Fallbacks, in order: another Standard Spark revision; Muse Spark Open through a documented provider, labeled as a different model with its own adapter tests; a labeled replay of recorded outputs. There is no silent substitution and never another model family.
* Bad, because `tool_choice` must be `"auto"` and generated arguments are not guaranteed to validate, so every output is validated ([ADR-0014](0014-run-one-coordinator-with-bounded-task-jobs.md)).
* Bad, because the account has no hard spending cap, only an email alert (RISK-21 in the [risk register](../project/risk-register.md)); application budgets are the only hard stop.

### Confirmation

GATE-01 ([Architecture constraints](../architecture/02-architecture-constraints.md#model-access-gate)): a server-side authenticated call, `muse-spark-1.3` listed for the team, strict structured output, `store: false` with encrypted reasoning replay across one tool round trip, streamed events to completion, refusal and error handling, and usage captured. Then AF-01, TR-02 and RL-01 in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

Platform facts: [technology source register](../../research/technology/source-register.md).

### The same model on Chat Completions

* Bad, because Chat Completions carries no reasoning across turns and has no search grounding (TECH-04).

### Muse Spark Open through a documented hosting provider

* Good, because it is Meta's open-weight model with documented hosting providers (TECH-32).
* Bad, because it is a different model release behind Chat Completions-style endpoints; it needs its own adapter tests, a separate data-use review and its own label. It is the second fallback.

### The Llama API

* Bad, because Llama models are not run through the Model API, and whether the older Llama API accepts new users was not verified (TECH-33).

### A model from another provider

* Bad, because the event rules require Meta AI products and weight Meta tooling at 25% in judging.

## More Information

Jobs for Meta's other models, each with an independent check: [ADR-0041](0041-give-each-meta-model-one-job-with-an-independent-check.md).
