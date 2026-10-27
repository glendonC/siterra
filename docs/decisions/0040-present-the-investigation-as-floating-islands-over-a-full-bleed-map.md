---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Present the investigation as floating islands over a full-bleed map

## Context and Problem Statement

The first high-fidelity prototype was judged too dense. Measured on scene 5, it showed about 20 visual groups and about 100 text or control items, with only about 43% of the frame left as open map ([UI patterns research](../../research/design/ui-patterns.md)). The founder asked for the cleanest result, like Magic Patterns. [ADR-0006](0006-use-a-guided-adaptive-investigation-workspace.md) keeps a guided workspace with five fixed sections; this decision refines its anatomy.

## Decision Drivers

* The map is the hero and must stay legible and immersive
* Two levels of progressive disclosure (Nielsen Norman Group) and a small number of separate groups (working memory holds about four chunks, Cowan 2001)
* Every fact still reachable without the map (accessibility)

## Considered Options

* Keep the docked column, timeline strip and director
* Floating islands over a full-bleed map with a visual budget per state
* Chat-first layout with embedded maps

## Decision Outcome

Chosen option: "floating islands with a visual budget", because it cuts visible groups to four or five, keeps about 60% of the frame as open map while working, and keeps the five sections as the reading order.

Islands: a case pill (top left), a map ornament with the Views menu, 3D toggle and zoom (top right), an opaque 480 px investigation sheet with only the focused section expanded, the director attached to the sheet's bottom edge, a timeline that is a 40 px scrubber until focused, and a legend only while a data layer shows. Focus mode hides the sheet. A view the user picks overrides the automatic map layer until their next command, and the legend says so. Text panels stay opaque; small control islands may use near-opaque glass (at least 90% tint). Dark is the default theme; a light theme is provided; the exported brief is light.

### Consequences

* Good, because each state has a measurable budget (islands, controls, expanded components, text items, open map share) that QA can check automatically.
* Good, because the answer card, inline citations with linked highlighting, and the review queue follow established patterns with MIT-licensed building blocks.
* Bad, because wide content (intervention comparison, full brief) moves to the inspector overlay instead of the sheet.

### Confirmation

VC-04 to VC-06 in [acceptance criteria](../project/acceptance-criteria.md) count islands, controls and covered area per state.
