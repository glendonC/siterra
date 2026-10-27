---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Keep the autonomous firm stance with human authority over real-world actions

## Context and Problem Statement

Siterra's mission is an autonomous environmental services firm: a client commissions an investigation and receives a body of professional work without operating each tool. Competitive research found a staffed, AI-assisted monitoring service already exists ([MKT-11](../../research/competitive/source-register.md)), so implying human analysts would mislead. Real-world actions (contacting people, spending, land-management decisions) need authority that software does not have. How should the product express autonomy honestly?

## Considered Options

* Autonomous firm that does the investigative work end to end and prepares actions; people with authority decide real-world actions
* Assistant framing (the user operates tools with AI help)
* Fully autonomous agent that also executes outreach and coordination

## Decision Outcome

Chosen option: "autonomous firm that prepares; people with authority decide", because it keeps the mission, matches how consultancies work (they prepare, clients authorize), and is honest about what software can do.

* Siterra plans, reads, measures, analyzes, compares explanations, prepares plans and documents, and owns the case over time without step-by-step direction.
* Operational actions stop at `prepared` until a role with authority decides ([review and authority](../reference/review-and-authority.md)).
* In product copy the actor is "Siterra"; the product never implies staff or personas ([ADR-0005](0005-name-siterra-as-the-only-actor-in-product-copy.md)).

### Consequences

* Good, because the demo shows real autonomy (planning, tool use, adaptation) without pretending to act in the world.
* Good, because expanding autonomy later (for example sending an approved message) is a permission change on `OperationalAction`, not a redesign.
* Bad, because "autonomous firm" needs one sentence of explanation in the pitch so viewers do not expect staff.

### Confirmation

DF-05, SA-01 to SA-07 and AF-01 to AF-05 in [acceptance criteria](../project/acceptance-criteria.md).
