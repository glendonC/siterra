---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Limit motion to reported state changes

## Context and Problem Statement

The workspace changes as Siterra's work lands: sections expand, components arrive, evidence moves into the ledger and periods change on the map. Motion can make those changes legible, but it can also distract, misrepresent values, break map gestures or exclude people who need reduced motion. What motion should the product use?

## Considered Options

* A catalog of specified motions under shared rules
* No motion: immediate state changes only
* Decorative motion: ambient loops, counting numbers, lines drawing on, parallax
* The View Transitions API for composition

## Decision Outcome

Chosen option: "A catalog of specified motions under shared rules", because motion then reports a state change the user needs to see, and nothing else.

The catalog starts with twelve motions, MOT-01 to MOT-12, each with a trigger, timing and fallback. The rules: one focal transition at a time; data never animates; only committed records or the user's own input trigger animation; nothing moves under the pointer or keyboard focus; the map canvas is never resized during a transition, because overlays change the camera padding instead; any input completes or cancels an animation within 100 ms; reduced motion removes camera flights, translations and shared-element travel. Specification: [motion](../reference/motion.md).

### Consequences

* Good, because animation never runs ahead of the case record.
* Good, because layout animations run only inside the investigation panel, never around the map, which avoids stretching the WebGL map canvas.
* Bad, because motion work can consume the schedule (RISK-07 in the [risk register](../project/risk-register.md)); P1 motions start only after all P0 tests pass.
* Bad, because the Motion library's reduced-motion setting removes transforms only, so opacity durations need their own reduced-motion handling.
* Neutral, because the fallback for any motion is an immediate state change with the same text announcement.

### Confirmation

MQ-01 to MQ-04, PF-03, PF-04, A11Y-03 (reduced motion) and A11Y-12 (pause and stop) in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

### No motion: immediate state changes only

* Good, because it carries no performance or reduced-motion risk.
* Bad, because changes the user needs to see, such as a section making room or evidence moving into the ledger, are reported in text only; it remains the fallback.

### Decorative motion: ambient loops, counting numbers, lines drawing on, parallax

* Bad, because values must appear in their final form, and ambient motion reports no state change.

### The View Transitions API for composition

* Bad, because root capture suspends hit testing (breaking map gestures), concurrent commits abort running transitions, and one image per boundary cannot express the evidence re-sort (MOT-05) ([generative workspace research](../../research/technology/generative-workspace.md)).

## More Information

Map scene playback (MOT-13) follows the same rules: [ADR-0035](0035-compose-map-scenes-from-reusable-templates.md).
