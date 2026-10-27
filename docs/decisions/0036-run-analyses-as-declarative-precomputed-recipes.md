---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Run analyses as declarative, precomputed recipes chosen by the model

## Context and Problem Statement

The founder wants AI to do real data-science work (trends, anomalies, strata, scenarios) to the best of its ability. Large language models are unreliable at choosing and running statistical methods: on realistic benchmarks the best agents complete roughly a quarter to two fifths of tasks, and wrong method choice is the leading failure ([data science research](../../research/science/analytics.md)). Meta's Model API has no hosted code execution. The project rule says the model never computes numbers. How can Siterra get genuine analytical depth from Muse safely?

## Considered Options

* Model-written analysis code run in a sandbox and saved as provenance
* A declarative catalog of deterministic recipes that the model selects, scopes and interprets
* No model involvement in analysis

## Decision Outcome

Chosen option: "declarative recipe catalog", because it gives the model real analytical choices (which recipe, which scope, how to interpret) while keeping every number reproducible and every method reviewable. Recipes are precomputed in the offline pipeline as derived bundles, so no live Python service is needed and staleness keeps working. The model commits its plan (recipes, scope, window) before reading results. Specification: [analysis recipes](../reference/analysis-recipes.md).

### Consequences

* Good, because method choice, assumptions, minimum data and failure modes are fixed per recipe version and shown as a method card.
* Good, because inapplicable recipes appear as blocked with the reason, which turns limits into visible states.
* Bad, because new analysis types need a reviewed recipe, not a prompt.

### Confirmation

A 12 to 15 prompt planning test graded deterministically (expected recipe, refusal or requirement) in the [evaluation harness](../reference/evaluation.md); numeric provenance checks.
