---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Differentiate through case discipline

## Context and Problem Statement

The realistic alternative to Siterra is not a general AI agent alone but an environmental analysis tool used alongside one. Global Nature Watch Horizon runs deterministic analyses and shows the code and data behind its charts (MKT-10), Trends.Earth documents climate-corrected productivity methods (MKT-09), Lens sells monitoring with analyst-reviewed AI drafts (MKT-11), and general agents plan, search, cite, keep projects and continue across devices (MKT-05, MKT-15 to MKT-18) ([competitive position](../explanation/competitive-position.md), [source register](../../research/competitive/source-register.md)). What can Siterra claim that these do not already cover?

## Considered Options

* Case discipline, with measurement, provenance, synchronized views and persistence as entry requirements
* Reproducible measurement and provenance display
* A novel drought-versus-degradation analysis
* Autonomy and multi-agent parallelism
* Human review and an audit trail

## Decision Outcome

Chosen option: "Case discipline, with measurement, provenance, synchronized views and persistence as entry requirements", because no inspected source describes one case record in which:

* competing explanations stay open until evidence separates them;
* livelihood and governance unknowns are blocking questions;
* reviews bind to an exact revision and authority;
* a changed input makes everything downstream stale;
* unresolved attribution becomes a traceable field-validation plan.

The claim rests on absence of evidence in vendor documentation, so it is a hypothesis to demonstrate, not a statement to assert. Measurement, provenance, synchronized views, persistence, step logs and multi-step autonomy must work, but they are not the pitch.

### Consequences

* Good, because each part of the claim is a pass or fail test on the built product.
* Good, because the claims Siterra must not make are listed in [competitive position](../explanation/competitive-position.md#claims-siterra-must-not-make), which keeps copy and pitch inside the evidence.
* Bad, because the comparison depends on vendor pages that change often; volatile facts must be rechecked before any public comparison (RISK-19 in the [risk register](../project/risk-register.md)).
* Bad, because there is no weaker fallback claim: if a test fails, the claim it covers is dropped.

### Confirmation

DF-01 to DF-06, defined in [competitive position](../explanation/competitive-position.md) and required as P0 tests in [acceptance criteria](../project/acceptance-criteria.md#differentiation). DF-01 and DF-04 prove the entry requirements; DF-02, DF-03, DF-05 and DF-06 prove case discipline.

## Pros and Cons of the Options

### Reproducible measurement and provenance display

* Bad, because GNW Horizon already offers deterministic, repeatable analyses with a code-and-data view (MKT-10); provenance is table stakes.

### A novel drought-versus-degradation analysis

* Bad, because Trends.Earth already implements RESTREND, rain-use efficiency and water-use efficiency corrections with CHIRPS (MKT-09).

### Autonomy and multi-agent parallelism

* Bad, because general agents already plan, show live progress and continue work (MKT-15 to MKT-18), and multi-agent parallelism is a commodity.

### Human review and an audit trail

* Bad, because Lens staff review AI-drafted observations (MKT-11), and Google's Geospatial Reasoning agent presents its output as a draft for expert review (MKT-12).

## More Information

A blinded comparison of a general agent alone, Horizon or Trends.Earth with a general agent, and Siterra is proposed in [competitive position](../explanation/competitive-position.md); it has not been run.
