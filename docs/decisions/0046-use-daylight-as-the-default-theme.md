---
status: accepted
date: 2026-10-27
decision-makers: founder, maintainer
---

# Use daylight as the default theme

## Context and Problem Statement

[ADR-0042](0042-compute-the-color-system-for-dark-and-light-themes.md) computed two complete color themes and made dark the default for the map workspace. Four key frames of the valley (arrival, the dry-year challenge, the verdict and the field plan) were then designed twice under the same rules and strings, once dark and once in daylight; the two sets were compared at full size beside the same reference frames, and daylight was chosen for the design. The whole hero sequence (opening page, globe, dive and the six valley beats) was then built in daylight, and the founder approved it on 27 Oct 2026 ("Yes. Build Siterra on this design."). Which theme does Siterra open in?

## Decision Drivers

* The founder approved the hero in daylight as the design to build.
* The case is a real place: the daylight frames show the irrigated valley floor, the dry slopes and the summer light, and read as a place rather than a tactical map.
* The interface must not look like a game or surveillance display; dark scenes lean on glow, which brings that look.
* The season stems and the two-tone verdict must read at a glance; on paper the verdict reads like the opening page, so the product ends the way it begins.
* Footage filmed in the valley must cut into the product without a jump in light.
* Every text and control role still meets its contrast target.

## Considered Options

* Keep dark as the default
* Make daylight the default
* Use daylight for the hero sequence and dark for the investigation workspace

## Decision Outcome

Chosen option: "Make daylight the default", because it is the design the founder approved, it carries one visual language from the opening page to the field plan, and every role still meets its contrast target.

* The light theme carries the approved hero's named colours (`palette.light.daylight`: paper, card, ink, grey, shadow tint, accent, land albedo, key light) and its data colours; [siterra.css](../../design/tokens/siterra.css) applies it by default and dark with `data-theme="dark"`.
* One warm accent (#B5561F) is used as light and as thin line only, never as a filled area; its 12-step scale sits in the accent's own hue.
* The color method of ADR-0042 is unchanged: scales computed in OKLCH from contrast targets, roles aliasing steps or named colours, data palettes per theme. Only its default-theme part is superseded.
* Dark stays a complete computed theme in the tokens and is not the default; the approved hero does not use it.
* The decision brief export stays light.

### Consequences

* Good, because one theme runs from the opening page to the field plan, and the approved frames are the reference for the build.
* Good, because every text role holds 4.5:1 and every control role 3:1 on all nine light backgrounds, recorded in the [contrast report](../../design/tokens/contrast-report.json).
* Neutral, because the dark theme is kept but no longer exercised by the hero; whether to offer it later is a separate decision.
* Bad, because the light data palettes were validated over the earlier light map ground; they must be checked again over the daylight land and the summer imagery (A11Y-06).
* Bad, because the approved rainfall display classes use the blues that the rainfall departure's wetter arm used, so that arm was recomputed in its own hue (violet, OKLCH hue 305) and the two are never drawn in one view.
* Bad, because daylight is a selected direction approved by the founder, not tested with users.

### Confirmation

VC-01 (tokens only) and A11Y-06 (contrast, including over terrain screenshots) in the [acceptance criteria](../project/acceptance-criteria.md); the token build regenerates the stylesheet and the contrast report from [siterra.tokens.json](../../design/tokens/siterra.tokens.json); the build's frames are compared with the approved hero frames.

## Pros and Cons of the Options

### Keep dark as the default

* Good, because data colours and relief were first tuned on a dark ground.
* Bad, because the founder approved the daylight design, and rejected an earlier arrival still that showed the valley as a slab on a dark background (27 Oct 2026).
* Bad, because in the side-by-side comparison the dark frames read as a tactical map, the game-interface look the case must avoid.

### Make daylight the default

* Good, because it is the approved design and reads as a place.
* Good, because the verdict on paper reads like the opening page.
* Bad, because the light data palettes need a new check over the daylight land.

### Use daylight for the hero sequence and dark for the investigation workspace

* Good, because each part could keep the ground it was first tuned for.
* Bad, because the product would change its light between the hero and the work, the jump the daylight decision removes, and every component would need two tested appearances.

## More Information

Rules, palettes and type: [design system](../reference/design-system.md). The hero sequence: [scenes](../reference/scenes.md#the-hero-sequence-design-language-13), [motion](../reference/motion.md#the-hero-timeline-design-language-13), [components](../reference/components.md#hero-components-design-language-13), [microcopy](../reference/microcopy.md).
