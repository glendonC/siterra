---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Prohibit causal diagnosis and outcome claims

## Context and Problem Statement

NDVI is a greenness proxy that climate, terrain, soils and management all affect, and spatial association alone does not identify a cause (SCI-05). In simulation, 30 to 40% degradation was needed before vegetation-index trends became detectable under rainfall-driven variability (SCI-29), and rain-use efficiency can fail to normalize rainfall (SCI-31). Livestock totals exist only at national level (SCI-44), and the demonstration collects no household data ([Scientific basis and limits](../explanation/scientific-basis.md)). What may Siterra claim from the evidence it has?

## Considered Options

* Descriptive comparison only, with prohibited claims enforced and missing evidence listed
* Attribution of vegetation change to grazing from NDVI trends
* A climate-corrected productivity analysis in P0
* Model estimates of biomass, carrying capacity or livestock numbers

## Decision Outcome

Chosen option: "Descriptive comparison only, with prohibited claims enforced and missing evidence listed", because the evidence cannot support causal diagnosis, biomass, carrying capacity, forecasts, household numbers or consent claims.

The P0 comparison aligns monthly departures on shared periods, uses prespecified 0 to 3 month antecedent windows and counts months with the same sign; it claims nothing beyond that. The hypothesis ledger lists a climate-corrected productivity trend over a longer record as missing evidence for the rainfall hypothesis. The list of prohibited claims: [Scientific basis and limits](../explanation/scientific-basis.md#claims-prohibited-in-the-demo).

### Consequences

* Good, because every statement stays inside what its evidence supports, which is the framing a remote-sensing reviewer expects.
* Good, because the missing evidence becomes field-plan measurements.
* Bad, because Siterra cannot say whether the pastures are overgrazed, and many results will read "Cannot be assessed with current data" (RISK-05 in the [risk register](../project/risk-register.md)).
* Bad, because overclaiming can still slip into copy or model text (RISK-10); the response is to remove the statement and keep the gap.

### Confirmation

PC-03, SV-02, SV-03, SV-07 and SA-06 in [acceptance criteria](../project/acceptance-criteria.md), and the prohibited-claims step of the validators in [Agent orchestration](../reference/agent-orchestration.md#validation).

## Pros and Cons of the Options

### Attribution of vegetation change to grazing from NDVI trends

* Bad, because an NDVI decline alone does not identify a cause, and rainfall-adjusted residuals still contain omitted variables, so they are not a grazing impact estimate.

### A climate-corrected productivity analysis in P0

* Good, because standardized methods exist: Trends.Earth implements RESTREND, rain-use efficiency and water-use efficiency corrections with CHIRPS inputs (SCI-34, MKT-09).
* Bad, because it needs a longer record and still does not estimate grazing impact; it is P2, and the field package may recommend it.

### Model estimates of biomass, carrying capacity or livestock numbers

* Bad, because uncalibrated NDVI cannot measure biomass or carrying capacity, and national livestock totals must never be downscaled to the valley.

## More Information

Forecasts in particular: [ADR-0039](0039-forecast-nothing-until-a-backtest-shows-skill.md).
