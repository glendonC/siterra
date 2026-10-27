---
status: accepted
date: 2026-10-27
decision-makers: maintainer
---

# Write in one plain voice and lint product copy

## Context and Problem Statement

Siterra's credibility depends on its words as much as its numbers: a status word, a button label or a model-written evidence statement can overclaim as easily as a chart. The founder asked for wording that a person understands at once and that avoids the generic phrasing common in AI-generated text. Copy is written by several people and, for evidence statements and brief lines, by a model. How should Siterra keep its wording plain, honest and consistent?

## Decision Drivers

* Statements must show what is known and how it is known; uncertainty is expressed with status words and evidence, not probabilities.
* The same rules must apply to strings people write and to model-written text accepted into the case.
* Copy must survive translation ([ADR-0034](0034-build-translation-ready-and-ship-french-first.md)).
* Checks must be automatic where they can be, so they hold under deadline pressure.

## Considered Options

* No written guide; review copy by taste
* Adopt an external style guide as it is (for example GOV.UK or Microsoft)
* A Siterra voice guide built on plain-language standards and product practice, with a copy lint that runs on interface strings and on model-written text

## Decision Outcome

Chosen option: "a Siterra voice guide with a copy lint", because external guides cover plain English but not Siterra's specific risks (overclaiming causes, staff personas, probability language, diagnosis words), and taste does not survive deadlines.

* Voice in one line: Siterra writes like a careful field scientist briefing a busy program manager: plain words, exact numbers, the same calm in success and failure, and clear about what is not known ([voice and tone](../reference/voice-and-tone.md)).
* Five principles: say what is known and how; plain words and exact numbers; name the gap, then the next step; Siterra acts and people decide; calm in every state.
* Banned and discouraged words with replacements, including vocabulary measurably overused in model-written text, marketing words, hedges, chat persona language and honesty violations.
* A copy lint with rule IDs `VT-NN`: errors block interface strings in CI; for model-written fields, errors reject the item before commit like the numeric provenance check, and warnings are logged in the trace. Exceptions are allowlisted by string ID with a written reason, never by pattern. A short review checklist covers what lint cannot catch.
* Every interface string comes from the [microcopy](../reference/microcopy.md) set and moves into message catalogs in the build.

### Consequences

* Good, because the same words mean the same thing on every screen and in every export, and generic phrasing is caught before it ships.
* Good, because model-written statements are held to the same rules as human-written ones.
* Bad, because lint has false positives that need allowlist entries, and tone still needs a person's review.
* Neutral, because some labels changed from earlier documents (for example "Start investigation", "Defer decision", "Contradicted by available evidence"); the voice guide lists what was applied.

### Confirmation

VC-06 (copy lint) in the [acceptance criteria](../project/acceptance-criteria.md); PC-03 and SV-03 cover diagnosis words and prohibited claims.

## Pros and Cons of the Options

### No written guide

* Good, because it costs nothing now.
* Bad, because the earlier documents already disagreed on spelling, status labels and button names.

### Adopt an external style guide as it is

* Good, because it is tested on millions of readers.
* Bad, because it has no rules for claim kinds, status words, persona language or model-written text.

## More Information

Sources: [writing research](../../research/design/writing.md).
