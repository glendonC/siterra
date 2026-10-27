---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Use a guided adaptive investigation workspace

## Context and Problem Statement

A user commissions a case about a real place and follows the evidence as Siterra's work arrives. The surface must be understood in seconds, keep geography in view, show where every claim comes from, stay synchronized with the case record, work with a keyboard and a screen reader, and be buildable in ten days. Which interaction architecture should the workspace use?

## Decision Drivers

* Understood within 15 seconds
* One owner for geographic gestures
* Agent-driven updates in place, with traceable evidence
* One source of state, with the case record authoritative
* Accessible reading order and narrow-screen layouts
* Performance with one map and several charts
* Ten-day delivery risk

## Considered Options

* Chat-first surface with embedded artifacts
* Open spatial canvas (tldraw-style)
* Guided adaptive investigation workspace

## Decision Outcome

Chosen option: "Guided adaptive investigation workspace", because it gives one place, one question and one action at arrival, lets one map own geographic gestures, and keeps the case record authoritative with the interface as a projection.

The workspace is a full-bleed relief map beneath opaque overlays, an investigation column with five fixed sections in reading order (Place, Observations, Explanations, Responses, Next steps), a temporal strip that binds time across map and charts, and a director that turns typed requests into work. There is no infinite canvas and no chat transcript as the main surface. Anatomy and responsive rules: [UX architecture](../reference/ux-architecture.md).

### Consequences

* Good, because semantic sections give a natural reading order and stack on narrow screens.
* Good, because evidence shares IDs and revisions across map, strip and column, with connectors drawn only on selection.
* Bad, because users cannot arrange or sketch content freely.
* Bad, because every component is real product work, which carries moderate ten-day risk; if animated composition proves unstable, the fallback keeps the same records and interactions with fixed sections, immediate state changes and a 2D map only, and never switches to an infinite canvas during the build.

### Confirmation

PC-01, PC-02, IU-01 to IU-04, VC-03, A11Y-01 (keyboard-only golden path) and A11Y-02 (screen reader pass) in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

Design assessments, not usability-study results. The same comparison with engineering detail: [technology source register](../../research/technology/source-register.md).

### Chat-first surface with embedded artifacts

* Good, because it is familiar, linear and accessible, with low ten-day risk.
* Bad, because the deliverable is buried in a transcript, appended results are hard to update in place, and claims duplicate across messages.
* Bad, because the map competes with scrolling messages, and separate chat and artifact states tempt divergence.
* Bad, because rich messages accumulate, and it offers no signature experience.

### Open spatial canvas (tldraw-style)

* Good, because its shape APIs are strong and its visual impact is strong, with a risk of disorientation.
* Bad, because canvas gestures conflict with map gestures, it is weak until pan, zoom and minimap are learned, and arbitrary placement needs collision and layout logic.
* Bad, because the shape store risks becoming a second database, and connectors tangle without strict rules.
* Bad, because spatial reading order needs a parallel semantic model, many embedded maps and charts render under transforms, and ten-day risk is the highest (integration plus an SDK production license key; [ADR-0020](0020-keep-tldraw-and-generated-ui-out-of-the-critical-path.md)).

### Guided adaptive investigation workspace

* Good, because a typed catalog with fixed sections and deterministic placement handles agent-driven updates ([ADR-0007](0007-constrain-ai-composition-to-a-component-catalog.md)).
* Good, because it renders one map and a small, fixed number of expanded components.
* Bad, because the risk is moderate rather than low.

## More Information

[ADR-0040](0040-present-the-investigation-as-floating-islands-over-a-full-bleed-map.md) refines the anatomy into floating islands over the map; the five fixed sections remain.
