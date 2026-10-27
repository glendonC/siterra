---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Measure AI work with an evaluation harness and show the results

## Context and Problem Statement

Validators reject bad model output, but reviewers and judges cannot see how often the model is right, how often it is repaired, or what the work costs. Claims of reliability need measurement. How should Siterra demonstrate the quality of its AI work?

## Considered Options

* Rely on validators alone
* A third-party evaluation platform
* An in-repository harness (gold sets, fixture cases, the production validators) run by one command, with results shown in the trace

## Decision Outcome

Chosen option: "in-repository harness", because it uses the same validators as production, needs no new service, and produces numbers the product can show honestly. Specification: [evaluation harness](../reference/evaluation.md).

### Consequences

* Good, because extraction fidelity, claim typing, status behavior, numeric provenance, schema adherence, safety, cost and time become measured facts.
* Good, because model or prompt changes can be compared on the same gold set (including Meta model routing choices).
* Bad, because gold sets take human time to write during the build.

### Confirmation

`pnpm eval` produces a report; the trace shows per-command quality checks from real events.
