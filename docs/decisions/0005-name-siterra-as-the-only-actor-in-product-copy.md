---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Name Siterra as the only actor in product copy

## Context and Problem Statement

"Autonomous environmental services firm" describes Siterra's mission, but no accountable professionals stand behind its outputs, and an AI-assisted monitoring service with in-house analysts already exists (Lens, MKT-11 in the [competitive source register](../../research/competitive/source-register.md)). Copy that implies staff would mislead users and invite comparison with people Siterra does not have. Who acts in product copy?

## Considered Options

* Siterra as the only actor
* A staffed voice ("our team", "analysts")
* Named agent personas

## Decision Outcome

Chosen option: "Siterra as the only actor", because it describes software doing the work without implying accountable professionals.

"Autonomous environmental services firm" stays the mission phrase. Inside the product the actor is Siterra ("Siterra retrieved 6 sources"), never "our team", "analysts" or named personas ([Product thesis and challenge](../explanation/product-thesis.md)).

### Consequences

* Good, because users are not led to expect professional accountability that does not exist.
* Good, because it matches the agent model, in which an agent is a bounded task and not a persona ([Agent orchestration](../reference/agent-orchestration.md)), and the design system, which has no avatars, mascots or decorative agent graphics ([Design system](../reference/design-system.md)).
* Bad, because "firm" still invites comparison with staffed services, so public copy describes software, not staff, and the pitch needs a sentence of explanation.

### Confirmation

No acceptance criterion tests this rule directly. Review UI strings and the host templates that write event messages for staff or persona wording, alongside the prohibited-claims scan (SV-03 in [acceptance criteria](../project/acceptance-criteria.md)).

## Pros and Cons of the Options

### A staffed voice ("our team", "analysts")

* Bad, because it implies accountable professionals behind the work, which Siterra does not have.

### Named agent personas

* Bad, because personas present bounded tasks as colleagues, and multi-agent parallelism is not a claim the product makes ([competitive position](../explanation/competitive-position.md)).

## More Information

The stance this copy rule serves: [ADR-0033](0033-keep-the-autonomous-firm-stance-with-human-authority.md).
