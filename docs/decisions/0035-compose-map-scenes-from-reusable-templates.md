---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Compose map scenes from reusable, case-agnostic templates

## Context and Problem Statement

The map must stand out (different angles, rotation, time playing over terrain) and the AI should create and apply scenes dynamically, without rebuilding them for every case and without generating code ([ADR-0020](0020-keep-tldraw-and-generated-ui-out-of-the-critical-path.md)). Which approach gives cinematic, reusable, safe scenes in the build window?

## Considered Options

* Rebuild scenes by hand for each case
* Model-written code (MapLibre or video components)
* deck.gl JSON layers with expressions as the scene language
* An existing story format (Mapbox storytelling, kepler.gl config, ArcGIS slides, Google Earth Studio)
* A Siterra scene grammar with a template library, resolver and deterministic player

## Decision Outcome

Chosen option: "scene grammar with template library, resolver and player", because it gives reuse across cases (templates bind to any case's records), safety (the model chooses and binds, never writes code or style JSON), and quality (views before animation, one playhead for time). Evidence: [map scenes research](../../research/technology/map-scenes.md). Specification: [scenes and views](../reference/scenes.md).

### Consequences

* Good, because a new case gets overview, obliques, orbit and time-lapse automatically.
* Good, because every scene is validated (bindings, geometry limits, style, text) and reproducible.
* Bad, because templates are code that must be reviewed and tested; new kinds of shots need a pull request.

### Confirmation

PF-04 (50 fps or stills only), MQ-01 to MQ-04, and the scene validator tests in the [delivery plan](../project/delivery-plan.md).

## More Information

deck.gl was rejected for now: its layers do not drape on MapLibre terrain and the case has no trajectory data. The model's `propose_scene` is P1; P0 uses deterministic default scenes per answer type.
