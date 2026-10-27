---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Frame the first case as a grazing pressure question

## Context and Problem Statement

The first case needs a real place and an environmental concern with published context. For the Aït Bouguemez valley in Morocco's Central High Atlas, published field research documents communal resource governance and pastoral livelihoods (SCI-01, SCI-02, SCI-04, SCI-19), but it does not establish the current condition of any slope, and NDVI alone cannot identify why vegetation changed (SCI-05) ([Scientific basis and limits](../explanation/scientific-basis.md)). How should the case be framed?

## Considered Options

* A grazing pressure question for the Aït Bouguemez valley, with pastoral livelihoods inside the analysis
* An "overgrazing detected" case for the same valley
* Regional context only, without an analysis geometry

## Decision Outcome

Chosen option: "A grazing pressure question for the Aït Bouguemez valley, with pastoral livelihoods inside the analysis", because it serves the founder's mission, published context exists for the valley, and a question keeps competing explanations open until evidence separates them.

The case is a pasture assessment and field-validation investigation. Arrival states the concern as reported ("Not established: whether vegetation has changed, or why"), never as a diagnosis ([Experience storyboard](../reference/experience-storyboard.md)).

### Consequences

* Good, because published research on agdal governance, herd mobility and women's landscape knowledge informs the livelihood constraints and the field plan.
* Good, because the hypothesis ledger can end with grazing "Cannot be assessed with current data" without contradicting the case title.
* Bad, because naming a real valley risks implying problems or decisions for a real community without its involvement (RISK-16 in the [risk register](../project/risk-register.md)); the case uses question framing, no household data and demo labels.
* Bad, because the published evidence is regional, historical or interview-based; it never stands in for a local measurement.
* Bad, because if no analysis geometry passes review ([ADR-0004](0004-use-the-ait-bouguemez-valley-catchment-as-study-area.md)), the case falls back to regional context only.

### Confirmation

PC-03 (no diagnosis words at arrival) and SV-03 (no prohibited claim in UI copy or generated text) in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

### An "overgrazing detected" case for the same valley

* Bad, because an NDVI decline alone does not establish a cause, and the claim is on the prohibited list ([ADR-0023](0023-prohibit-causal-diagnosis-and-outcome-claims.md)).

### Regional context only, without an analysis geometry

* Good, because it needs no geometry review.
* Bad, because observation bundles are computed for an analysis geometry, so without one the case shows no measurement; it remains the fallback.
