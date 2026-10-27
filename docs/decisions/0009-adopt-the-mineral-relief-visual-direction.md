---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Adopt the mineral relief visual direction

## Context and Problem Statement

The interface puts a relief map, scientific charts and typed claims on one screen. The visual system must keep data colors legible over terrain, meet contrast targets, distinguish claim kinds and states without relying on color alone, and give the product an identity that does not read as a generic dashboard. Which visual direction should the design system follow?

## Considered Options

* Mineral relief, field precision: a dark relief stage, the IBM Plex family, separate data palettes and cartographic restraint
* A light interface
* An operational dashboard style: dense panels, an alarm palette and translucent panels over the map
* Inter as the interface typeface

## Decision Outcome

Chosen option: "Mineral relief, field precision: a dark relief stage, the IBM Plex family, separate data palettes and cartographic restraint", because the identity comes from the subject (a high mountain valley read through cartography and field science), and its legibility and contrast are computed rather than assumed.

The palette is dark with opaque panels, one interaction accent, and status shown as an icon plus words. Data palettes (NDVI, rainfall, missing and excluded hatches) are separate from brand and status colors and checked for color-vision deficiency. Type is IBM Plex Sans, with Plex Sans Condensed for map labels and dense tables and Plex Mono for identifiers only. Values and rules: [Design system](../reference/design-system.md) and the [design tokens](../../design/tokens/siterra.tokens.json).

### Consequences

* Good, because contrast is computed: primary text reaches 12.55:1 on the panel surface, and the control border, once measured at 2.57:1, is corrected to 3.45:1 with a separate `border-control` token.
* Good, because Plex has a condensed width for cartography, an Arabic companion for future interfaces, and the SIL OFL 1.1 license for self-hosting.
* Bad, because the direction is selected, not user-tested, and its colors have not been checked over real terrain imagery.
* Bad, because caution and danger are close under deuteranopia (ΔE 4.0) and the near-zero NDVI anomaly pair sits in the color-vision floor band, so icons, words, legends, values and tables are mandatory.

### Confirmation

VC-01 (tokens only), VC-02 (type scale only), VC-03 (composition review against the design references) and A11Y-06 (contrast from the computed token report and on real terrain screenshots) in [acceptance criteria](../project/acceptance-criteria.md); the computed [contrast report](../../design/tokens/contrast-report.json).

## Pros and Cons of the Options

### A light interface

* Neutral, because the exported brief is already light for print, and the founder may override the dark default after seeing the prototype.

### An operational dashboard style: dense panels, an alarm palette and translucent panels over the map

* Bad, because the inspected references set these aside (VIS-09: dense operational dashboard, alarm palette), the design system never paints an alarm class from NDVI, and panels over the map stay opaque, with no glass or blur ([Design references](../explanation/design-references.md)).

### Inter as the interface typeface

* Good, because its screen legibility at 14 px is comparable.
* Bad, because the design system prefers Plex for an engineered character without the default-startup look, a condensed width for map labels and an Arabic companion.

## More Information

The direction stands. Its palette values, contrast figures and the dark-only stance were later replaced by computed scales for dark and light themes in [ADR-0042](0042-compute-the-color-system-for-dark-and-light-themes.md); the island layout in [ADR-0040](0040-present-the-investigation-as-floating-islands-over-a-full-bleed-map.md) allows near-opaque glass on small control islands only.
