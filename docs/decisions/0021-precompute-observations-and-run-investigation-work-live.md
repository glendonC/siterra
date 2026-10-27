---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Precompute observations and run investigation work live

## Context and Problem Statement

Processing seven years of monthly satellite and rainfall observations is slow, depends on external catalogs and must be reproducible. The investigation itself (planning, reading sources, comparing explanations, composing results) must be real work, or the autonomy is faked. Which work runs ahead of time, and which runs live?

## Considered Options

* Observations precomputed offline into validated bundles, with planning, reading, comparison and composition live
* Live catalog queries and raster processing during each command
* A precomputed or replayed investigation

## Decision Outcome

Chosen option: "Observations precomputed offline into validated bundles, with planning, reading, comparison and composition live", because it gives reliability without fake autonomy.

The offline Python pipeline emits frozen, checksummed bundles with manifests ([Data sources and reproducible methods](../reference/data-sources-and-methods.md), [observation preprocessing](../reference/observation-preprocessing.md)). The application imports them and never computes observation values itself; live tasks read them through deterministic tools. The interface labels precomputed observations as precomputed and live work as live.

### Consequences

* Good, because the demonstration does not depend on live catalog queries or raster export queues, and frozen bundles reduce dependence on hosted analysis environments, which can be retired (MKT-13).
* Good, because each bundle can be reproduced from its manifest.
* Bad, because a new parameter or a new period needs a pipeline run, not a live request.
* Bad, because the first bundle may not validate in time (RISK-03 in the [risk register](../project/risk-register.md)); the fallback is a shorter period or seasonal composites, then the blocked-observation path (published context, missing-data states and the field-scoping package). Values are never generated.

### Confirmation

SV-01 (reproducible measurement), RL-02 (missing dataset), AF-02 (no canned response path in live mode) and AF-05 (deterministic numbers) in [acceptance criteria](../project/acceptance-criteria.md); GATE-02 in the [delivery plan](../project/delivery-plan.md#gates).

## Pros and Cons of the Options

### Live catalog queries and raster processing during each command

* Bad, because the demonstration would depend on live catalog queries and raster export queues ([technology source register](../../research/technology/source-register.md)).

### A precomputed or replayed investigation

* Bad, because canned results would fake the autonomy the product claims; replay exists only as a labeled fallback when model access fails.

## More Information

Analyses beyond the observation summaries follow the same principle: [ADR-0036](0036-run-analyses-as-declarative-precomputed-recipes.md).
