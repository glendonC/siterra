---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Treat the case record as authoritative

## Context and Problem Statement

Map, temporal strip, charts, director, brief and trace all show the same case while Siterra's tasks change it. If a view holds its own copy of a fact, views drift apart, a reload cannot restore the state, and a changed input cannot mark its dependents stale. Where does the truth about a case live?

## Considered Options

* One authoritative case record, with every view a projection bound to exact revisions
* Separate conversation state and artifact state
* A canvas shape store beside the case database
* State held by an external agent runtime

## Decision Outcome

Chosen option: "One authoritative case record, with every view a projection bound to exact revisions", because it gives consistency across views, replay after reload, and staleness propagation.

Every entity has an `id` and a `revision`; derived records cite the exact versions of their inputs; a task result becomes one atomic commit against an expected case revision. Records live in PostgreSQL. The URL and client state hold only view state (period, focus, open inspector, camera). Semantics: [Data contracts](../reference/data-contracts.md#principles).

### Consequences

* Good, because a reload restores the same revision, area, period and focus without re-running any task.
* Good, because a changed measurement, bundle, geometry or summary parameter marks every dependent record stale, including hypotheses, brief items and review decisions.
* Bad, because every component must bind exact entity revisions, and commits are serial per case.
* Bad, because concurrent changes need explicit rebase or re-plan rules; the last writer never simply wins.

### Confirmation

DF-03, DF-04, RL-04, RL-05, SV-06 and TR-01 in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

### Separate conversation state and artifact state

* Bad, because separate chat and artifact states tempt divergence ([ADR-0006](0006-use-a-guided-adaptive-investigation-workspace.md)).

### A canvas shape store beside the case database

* Bad, because the shape store risks becoming a second database.

### State held by an external agent runtime

* Bad, because an external runtime's session durability does not replace Siterra's case records (TECH-25 in the [technology source register](../../research/technology/source-register.md)).
