---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Build one gated case ending in a field-validation plan

## Context and Problem Statement

Siterra's mission is an autonomous environmental services firm, and the build window is ten days. Remote data may not show anything conclusive about a pasture question, no user demand has been validated, and Siterra has no authority to manage land, contact people or report outcomes ([Product thesis and challenge](../explanation/product-thesis.md)). What should the first build demonstrate so that its work product is recognizable and honest about what remote data can show?

## Decision Drivers

* A work product that an environmental program manager recognizes
* Honesty about what remote observations can and cannot establish
* Real autonomy inside explicit authority limits
* Ten-day delivery risk

## Considered Options

* One commissioned case, end to end, ending in a reviewable field-validation plan, behind gates
* One case that ends in a diagnosis or a recommended land-management action
* A cited research report as the deliverable
* Several cases or a multi-case platform

## Decision Outcome

Chosen option: "One commissioned case, end to end, ending in a reviewable field-validation plan, behind gates", because the deliverable is the scoping phase of an environmental engagement (desk review, remote-sensing baseline, options screening and terms of reference for fieldwork), and an inconclusive result that names what would decide it is a full result that feeds the plan.

Siterra demonstrates research, measurement, interpretation and preparation inside explicit authority limits. It does not demonstrate land management, outreach or outcomes. Gates GATE-00 to GATE-03 in the [delivery plan](../project/delivery-plan.md#gates) can narrow the demonstration; none of them permits an invented result.

### Consequences

* Good, because an inconclusive data result still produces the deliverable: the missing measurements become field-plan items (RISK-05 in the [risk register](../project/risk-register.md)).
* Good, because one case keeps the scope inside ten days, with the expensive science precomputed ([ADR-0021](0021-precompute-observations-and-run-investigation-work-live.md)).
* Bad, because one case cannot show that the approach generalizes, and the primary user is a design persona without interviews.
* Bad, because the demonstration depends on gates that can fail; a failed gate narrows it (labeled replay of model outputs, a shorter observation period, the blocked-observation path, or cutting all P1 work) and never fills the gap with invented results.

### Confirmation

The [definition of done](../project/delivery-plan.md#definition-of-done-for-submission) in the delivery plan: all P0 criteria in [acceptance criteria](../project/acceptance-criteria.md) pass on the deployment, including DF-06 (the field-validation package), IU-01 (golden path without coaching) and DQ-01 (the golden path runs live end to end twice).

## Pros and Cons of the Options

### One case that ends in a diagnosis or a recommended land-management action

* Bad, because vegetation indices cannot establish a cause or a land-management need ([ADR-0023](0023-prohibit-causal-diagnosis-and-outcome-claims.md)), and authority over land sits outside the application ([ADR-0024](0024-require-role-specific-review-with-no-outbound-actions.md)).

### A cited research report as the deliverable

* Bad, because general agents already produce cited reports with editable plans and live progress, so a report alone is a commodity and shows no ownership of a case ([competitive position](../explanation/competitive-position.md)).

### Several cases or a multi-case platform

* Bad, because the [feature ranking](../project/delivery-plan.md#feature-ranking) puts a second case out of scope: high complexity and high dependency risk for about three lane-days.
