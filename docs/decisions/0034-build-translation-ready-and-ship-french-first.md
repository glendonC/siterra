---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Build translation-ready from the start and ship French first

## Context and Problem Statement

Siterra is meant to be usable globally and by local actors, for example a tour operator in the High Atlas who wants to raise a concern with officials or community groups. Morocco is multilingual: French is widely used in administration and business and in much of the agdal literature; Modern Standard Arabic is official; Darija and Amazigh varieties (Tamazight, Tashelhit, Tarifit) are widely spoken and often oral ([LANG-01 to LANG-03](../../research/competitive/source-register.md)). Machine translation quality for Darija and Amazigh varieties is unverified, and a wrong translation in a community conversation causes real harm. How far should the product go?

## Considered Options

* English only
* Translation-ready architecture now, French interface and machine-drafted French briefs next, Arabic, Darija and Amazigh only after evaluation with native speakers
* Full multilingual output in all relevant languages now

## Decision Outcome

Chosen option: "translation-ready now, French first, other languages after evaluation", because preparing the architecture is cheap at the start and expensive later, French serves the most likely readers with the best model quality, and gated languages avoid presenting untested translation as verified communication.

* P0: externalized strings, locale-aware dates and numbers, right-to-left capable layout, fonts covering Arabic and Tifinagh, and the original language recorded on every statement.
* P1: French interface and Muse-drafted French briefs and field plans, each labeled "Machine-drafted translation, needs local review", with the original kept alongside; a read-only shared brief link created by the user.
* P2: Arabic, Darija and Amazigh after testing with consenting native speakers; spoken briefings where literacy or script preference calls for them.

### Consequences

* Good, because local users can work with officials and groups in a common language without Siterra contacting anyone.
* Good, because translation metadata (machine draft or human reviewed, reviewer, revision) keeps provenance honest.
* Bad, because every translated output needs a visible review state and the brief template must handle longer French strings.

### Confirmation

Strings lint for hard-coded copy; a French brief export shows the machine-draft label and the original text; [accessibility and language](../reference/accessibility-and-language.md) release checks.
