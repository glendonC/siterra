---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Ship typed English commands before voice

## Context and Problem Statement

The director turns user requests into work. Every request must carry its context (case, revision, area, period and focus), stay editable before it is sent, and work with a keyboard and without voice. Meta hosts a speech-to-text model, Muse Voice Transcribe, on the same platform as the reasoning model, and the event rules weight use of Meta AI tooling at 25% (TECH-29). Which input modes should the first build support?

## Considered Options

* Typed English commands in P0, with push-to-talk voice as a P1 stretch through the same command contract
* Voice as a primary input
* Typed commands only

## Decision Outcome

Chosen option: "Typed English commands in P0, with push-to-talk voice as a P1 stretch through the same command contract", because reliability comes first, and voice adds Meta tooling value only once every P0 test passes.

Voice, if built, is push-to-talk, then transcription, then an editable visible transcript, then an explicit submit into the same typed-command pipeline. It needs microphone permission, a visible recording state, cancel and delete controls and a disclosed retention policy ([Accessibility and language](../reference/accessibility-and-language.md)).

### Consequences

* Good, because one command contract serves typed and spoken input, and the typed path stays primary and accessible.
* Good, because a poorly transcribed instruction never goes straight into actions.
* Bad, because English is a demonstration choice, not evidence that intended participants prefer it (RISK-17 in the [risk register](../project/risk-register.md)), and Darija and Amazigh speech reliability is unevaluated.
* Neutral, because if voice is not built, typed input alone meets every P0 criterion.

### Confirmation

IU-03 (context visible before submit), IU-04 (errors keep input) and A11Y-01 (keyboard-only golden path) in [acceptance criteria](../project/acceptance-criteria.md). Voice work starts only after every P0 criterion passes.

## Pros and Cons of the Options

### Voice as a primary input

* Bad, because the main flow must work without voice, and speech reliability for local languages must be evaluated with consenting speakers before any language claim.

### Typed commands only

* Good, because it carries the least risk.
* Bad, because it leaves out an inexpensive use of Meta's hosted speech-to-text once P0 passes.

## More Information

Interface language and translation: [ADR-0034](0034-build-translation-ready-and-ship-french-first.md).
