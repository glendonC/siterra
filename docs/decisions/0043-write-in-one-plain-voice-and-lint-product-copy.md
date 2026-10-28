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

## Amendment 1: precise, not conversational

Status: **Accepted** (2026-10-28). The decision above stays accepted; this amendment updates the plain-voice rule where it says so.

The founder asked for interface copy that is precise, not conversational, and for Siterra to read as a general five-stage analysis engine with the High Atlas case as its first loaded Region Pack.

Accepted changes:

* Controls, tabs, badges, navigation, section and stage headers become 1 to 3 word Title Case names ("Run Assessment", "Field Unverified"). No sentences, metaphors, first person, "you", slogans or meta-commentary. Badge segments may use a middle dot; "&" may join words inside a name.
* Findings and detail lines are short, exact, declarative sentences with numbers and source references.
* Coverage boundaries are a badge ("Coverage Required", "Dataset Not Loaded") and two sentences: what is missing, what is required.
* The five stages are Scope & Baseline, Evidence, Hypothesis Testing, Interventions & Precedents and Field Verification. "Causal Attribution" and "Validated Interventions" are not used: ADR-0023 bars causal diagnosis, precedents are published studies, and nothing is validated in the field.
* "Telemetry", "Attribution", "Autonomous" (for actions) and "Validated" or "Verified" for anything not validated are banned. A bundle's `validated` status is shown as "passed automated data checks".
* The Region Pack is shown as an object with a truthful status ("Real Data · Field Unverified").
* The evidence-kind labels stay as they are.

Consequences:

* Good, because headers and badges scan as names, and the lint (VT-09 Title Case, VT-44 to VT-49) holds the standard automatically.
* Good, because the product framing no longer depends on one place.
* Bad, because it reverses the guide's earlier sentence-case rule, which cited plain-language sources (WRT-10, WRT-13, WRT-17, WRT-21, WRT-25); Title Case on longer labels reads more formally.
* Bad, because "you" no longer appears in helper text, so some instructions become terser.

The [voice and tone guide](../reference/voice-and-tone.md#the-precise-standard-accepted-amendment-28-oct-2026) and [microcopy section 25](../reference/microcopy.md#25-the-precise-standard-in-the-build-accepted) carry the accepted rules and strings; the build follows them.

