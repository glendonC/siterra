---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Forecast nothing until a pre-registered backtest shows skill

## Context and Problem Statement

Forecasting is an obvious request for an AI environmental product. The record is seven years of monthly Sentinel-2 data with winter gaps. Validated vegetation forecasts found in the literature look weeks to a month ahead with fifteen or more years of data and draw much of their skill from persistence; no published check of seasonal rainfall forecast skill for the Central High Atlas was found ([data science research](../../research/science/analytics.md)). A model-generated forecast would be invented, and a weak statistical one would mislead.

## Considered Options

* Let the model forecast from its own judgment
* Fit a forecasting model and show it with intervals
* Forecast nothing; offer a dry-year scenario; allow an outlook only after a pre-registered backtest beats climatology and persistence

## Decision Outcome

Chosen option: "forecast nothing until a backtest shows skill", because it is the only option consistent with the evidence and the product's honesty. Forecast requests receive a refusal that names what is missing and creates an analysis or field requirement. The honest substitute is the dry-year scenario: what the record's driest seasons looked like here. The backtest (P2) is expected to report "did not beat climatology", which is itself a valid finding.

### Consequences

* Good, because no number on screen can be mistaken for a prediction.
* Bad, because a judge expecting forecasts sees a refusal; the demo must show it as a feature (it says what would make a forecast possible).

### Confirmation

The prohibited-claims scan includes forecast wording; SV-03 in [acceptance criteria](../project/acceptance-criteria.md).
