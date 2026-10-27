---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Make the drought challenge the signature interaction

## Context and Problem Statement

A map with panels can read as a dashboard, and autonomy claims are easy to fake. The demonstration needs one moment that shows Siterra reasoning with evidence, doing new work in response to the user, and turning a limit into the next action ([Product thesis and challenge](../explanation/product-thesis.md)). Which interaction should carry that moment?

## Considered Options

* The drought challenge resolving into a hypothesis ledger
* A 3D arrival over the valley
* Synchronized period scrubbing across map, chart and strip
* A written answer to the challenge

## Decision Outcome

Chosen option: "The drought challenge resolving into a hypothesis ledger", because it makes reasoning visible and turns a limit into the next action, and of these options it is the only one the delivery plan ranks high for user value, scientific integrity, demo impact and differentiation.

The user asks "Could drought explain this instead?". Siterra runs new tasks; the rainfall grid appears on the map; an aligned rainfall panel joins the vegetation record; existing evidence travels into a hypothesis ledger that shows what supports, contradicts and is missing for each explanation. Grazing ends "Cannot be assessed with current data", and its missing measurements seed the field plan. Scene detail: [Experience storyboard](../reference/experience-storyboard.md).

### Consequences

* Good, because the missing evidence for grazing (animal numbers and timing, the access calendar, field vegetation surveys) becomes field-plan measurements.
* Good, because the challenge creates real tasks and tool calls that appear in the trace.
* Bad, because the drought comparison is not novel science (Trends.Earth, MKT-09); the P0 comparison stays descriptive and lists a climate-corrected productivity analysis as missing evidence ([ADR-0023](0023-prohibit-causal-diagnosis-and-outcome-claims.md)).
* Bad, because it depends on a validated rainfall bundle; without one, the rainfall hypothesis reads "Cannot be assessed" with the named dependency.
* Bad, because shared-element evidence travel (MOT-05) is schedule risk; the fallback is the ledger without chip travel.

### Confirmation

DF-02, AF-02 (real follow-up work) and SV-05 (rainfall scale honesty) in [acceptance criteria](../project/acceptance-criteria.md); MQ-01 and MQ-03 for the evidence re-sort.

## Pros and Cons of the Options

Ratings from the [feature ranking](../project/delivery-plan.md#feature-ranking) in the delivery plan.

### A 3D arrival over the valley

* Good, because its demo impact is high.
* Bad, because user value, scientific integrity and differentiation are low; it is P1 (MOT-01).

### Synchronized period scrubbing across map, chart and strip

* Good, because user value, scientific integrity and demo impact are high.
* Bad, because differentiation is low; synchronized views are an entry requirement ([ADR-0002](0002-differentiate-through-case-discipline.md)).

### A written answer to the challenge

* Bad, because a challenge must trigger new tasks, not a paragraph, and a cited answer is a commodity.
