---
status: accepted
date: 2026-10-27
decision-makers: maintainer
---

# Compute the color system for dark and light themes

## Context and Problem Statement

The first palette ([ADR-0009](0009-adopt-the-mineral-relief-visual-direction.md)) was a dark set of hand-picked values checked after the fact; one of its claims (control borders at 3:1) proved false when computed. The founder asked for professional, enterprise-grade colors designed with color theory rather than picked by eye, for the map and for the product as a whole. The interface also needs a light theme for exports, print and bright rooms, and every role must hold its contrast in both themes and over terrain. How should Siterra's colors be produced?

## Decision Drivers

* Contrast targets are met by construction, not checked afterwards.
* Interaction, status and data colors never borrow from one another.
* Data palettes stay readable for people with color-vision deficiency and over hillshaded relief.
* Both themes come from the same rules, so a component never needs theme-specific color logic.

## Considered Options

* Keep the hand-picked dark palette and add a light variant by hand
* Adopt an existing open scale set (for example Radix Colors) as it is
* Compute project scales in OKLCH from contrast targets, with roles aliasing scale steps

## Decision Outcome

Chosen option: "compute project scales in OKLCH from contrast targets", because it meets every contrast target by construction in both themes, keeps one rule set for both, and keeps the mineral relief direction of ADR-0009 while replacing its hand-picked values.

* Six 12-step scales (neutral and accent at hue 215, success, warning, danger, info) per theme: steps 1 to 5 at fixed lightness for backgrounds, steps 6 to 12 solved for separator, control-boundary (3:1) and text (4.5:1 and 7:1) targets, with APCA as an advisory second check ([design system](../reference/design-system.md#color)).
* Components use roles (`bg.surface`, `text.secondary`, `border.control`, `interactive.default`), never raw steps; roles alias steps in each theme.
* Data palettes (NDVI, NDVI departure, rainfall departure, strata, missing and excluded hatches) are separate per theme and validated with a color-vision-deficiency simulation and over each theme's map ground; map colors (hillshade, outline, labels, rainfall grid, horizon) are tokens too.
* Dark stays the default for the map workspace; light is a full computed theme; the decision brief export is always light. (The default-theme part is superseded by [ADR-0046](0046-use-daylight-as-the-default-theme.md): daylight is the default.)
* Tokens are stored as DTCG srgb colors with hex values, with the computed OKLCH components kept under `$extensions` ([ADR-0029](0029-store-design-tokens-in-the-dtcg-format.md)).

### Consequences

* Good, because every text and boundary role meets WCAG 2.2 targets on every persistent background in both themes, recorded in the [contrast report](../../design/tokens/contrast-report.json).
* Good, because the accent, status and data colors cannot collide: each has its own hue and its own job.
* Neutral, because the accent moves from the earlier teal-gray family (chroma-weighted mean hue about 189) to hue 215, the hue in that range farthest from every data color (6.4 OKLab units from the nearest, against 3.4 for the earlier hue next to the strongest greener vegetation class); screenshots made before this decision show the old palette.
* Bad, because no four-color strata set passes every check in the dark theme, so strata use three colors plus a patterned neutral.
* Bad, because a computed palette is still a selected direction; it has not been tested with users or checked over real Sentinel-2 imagery of the valley.
* Bad, because the near-reference pair of the departure palettes sits close to the color-vision floor, so legends, values and table views stay mandatory.

### Confirmation

VC-01 (tokens only) and A11Y-06 (contrast in both themes, including over terrain screenshots) in the [acceptance criteria](../project/acceptance-criteria.md); the token build regenerates the stylesheet and the contrast report from [siterra.tokens.json](../../design/tokens/siterra.tokens.json).

## Pros and Cons of the Options

### Keep the hand-picked dark palette and add a light variant by hand

* Good, because no new work is needed for the dark theme.
* Bad, because its values were chosen first and checked later, which already produced one false contrast claim, and a hand-made light variant repeats the problem.

### Adopt an existing open scale set as it is

* Good, because it is tested in many products.
* Bad, because its steps are tuned for other backgrounds and hues; Siterra's map ground, data palettes and status semantics would still need their own computation.

## More Information

Method, sources and validation results: [color system research](../../research/design/color-system.md).
