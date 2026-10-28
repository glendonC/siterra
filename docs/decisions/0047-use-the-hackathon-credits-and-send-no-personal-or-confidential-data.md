---
status: accepted
date: 2026-10-28
decision-makers: founder
---

# Use the hackathon credits and send no personal or confidential data

## Context and Problem Statement

[ADR-0015](0015-use-a-meta-model-through-the-responses-api.md) chose `muse-spark-1.3` in Standard mode and counted on Standard-mode content not being used for training (TECH-31). The founder's Meta Model API account then showed USD 150.00 of free hackathon credits in use, with the line "While using free credits your content may be used for product improvement." and a "Stop using free credits" link on its Billing page (seen on 28 Oct 2026). While the credits are in use, Siterra's live model calls fall under that term, not only under the Standard-mode data use. Should Siterra use the credits, and what may it send while it does?

## Considered Options

* Keep the free credits on and send no personal or confidential data
* Stop using the free credits and pay every call by card
* Ask Meta for Zero Data Retention

## Decision Outcome

Chosen option: "Keep the free credits on and send no personal or confidential data", because the founder decided on 28 Oct 2026 to use the credits for the hackathon ("Use as mauch of the 150$ credits ass you want its for this hackathon"), and what Siterra sends to the model is public case material: published sources, precomputed observation results and the case record built from them.

* The model mode stays Standard; Contributor mode is never used.
* Model requests carry no personal or confidential data: no names, household locations, phone numbers, field notes, consent records or access-sensitive site details, the same list that public fixtures exclude ([cross-cutting concepts](../architecture/08-cross-cutting-concepts.md#security-and-privacy)).
* Credits are used first. Anything billed to the card stays inside the founder's cap for live model calls, and application budgets remain the only hard stop.
* The data-use part of ADR-0015 (Standard-mode content is not used for training) is superseded while the credits are in use. Its model, API and request rules are unchanged.

### Consequences

* Good, because the live runs of the build and the gates are paid from the credits, not the card.
* Bad, because Meta may use what Siterra sends for product improvement while the credits are in use, so the data-use promise of ADR-0015 no longer holds in that period.
* Bad, because the rule rests on what is sent, not on a contract term: a typed command or an added source with personal data would reach Meta under the credit term. The public demo needs its own decision on what visitors may type and on its spend caps.
* Neutral, because stopping the credits restores the Standard-mode data use and needs a new decision.

### Confirmation

A review of what model requests carry: the case corpus, the bundles and the seed case hold no personal or confidential data, and each new source is checked before it joins the corpus. The spend and the paying source of every live run are recorded. No acceptance test covers this rule yet.

## Pros and Cons of the Options

### Stop using the free credits and pay every call by card

* Good, because Standard-mode data use holds for every call.
* Bad, because every live run is charged to the card, against the founder's decision to use the credits.

### Ask Meta for Zero Data Retention

* Bad, because it needs sales enablement and disables stateful requests, background requests, file uploads and web search (TECH-31).

## More Information

Platform facts: [technology source register](../../research/technology/source-register.md). Adapter rules: [architecture constraints](../architecture/02-architecture-constraints.md#model-platform).
