---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Run one coordinator with bounded task jobs

## Context and Problem Statement

Siterra must show real autonomy: one commission produces a plan that executes without further input, and a challenge triggers new work. It must also never fabricate a number, act outside its authority, or let retrieved text change its instructions. Meta's Responses API accepts only `tool_choice: "auto"`, so the application cannot force a tool call (TECH-07). How should the agent work be shaped?

## Considered Options

* One coordinator with bounded task jobs, read and deterministic tools only, and proposals as structured final outputs
* Conversational agent personas working in threads
* A general agent with broad tools (shell, code, browsing, messaging)

## Decision Outcome

Chosen option: "One coordinator with bounded task jobs, read and deterministic tools only, and proposals as structured final outputs", because it gives real autonomy without fabricated numbers.

A task has an input snapshot, a tool allowlist, a typed result, a budget, a deadline, dependencies and a trace; it is not a persona or a conversation. Function tools only read or compute deterministically, and each task ends with its proposal as a strict structured output generated from Zod. Every proposal passes layered validators before it commits: completion, schema, references, claim rules, numeric provenance, prohibited claims, authority, and transitions and limits, then one atomic commit. Every excerpt must match the extracted text of its cited page. Specification: [Agent orchestration](../reference/agent-orchestration.md).

### Consequences

* Good, because every number in model-written text must match a referenced measurement, a date or a number inside a cited excerpt.
* Good, because tools are read-only or deterministic, so retries and worker restarts are harmless, and retrieved text is untrusted evidence that cannot change tools, permissions or instructions.
* Bad, because the model gets one repair turn for a rejected domain proposal; a second rejection fails the task with its issues in the trace.
* Bad, because host-enforced budgets (by default USD 0.50 of model and search spend and 180 s per command) can end work early with a partial package.
* Bad, because structured output or tool calling may prove unreliable for the task schemas (RISK-02 in the [risk register](../project/risk-register.md)); the fallback narrows the model's role to planning, extraction and composition and keeps every validator.

### Confirmation

AF-01 to AF-05, SV-02, TR-02, TR-04, RL-01 and RL-06 in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

### Conversational agent personas working in threads

* Bad, because personas present tasks as colleagues ([ADR-0005](0005-name-siterra-as-the-only-actor-in-product-copy.md)), and multi-agent parallelism is a commodity, not a claim the product makes.

### A general agent with broad tools (shell, code, browsing, messaging)

* Bad, because outbound and mutating tools would move authority into the application ([ADR-0024](0024-require-role-specific-review-with-no-outbound-actions.md)); shell, arbitrary code, SQL, unrestricted browsing, messaging and payments are not exposed in any phase.
