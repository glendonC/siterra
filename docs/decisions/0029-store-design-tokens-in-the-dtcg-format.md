---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Store design tokens in the DTCG format

## Context and Problem Statement

Colors, type, spacing, radii, motion durations and data palettes live in [siterra.tokens.json](../../design/tokens/siterra.tokens.json), which feeds the prototype stylesheet and, later, the Tailwind theme. The file was mostly project-specific JSON, with 19 of 111 leaf values using `$value`, and the prototype stylesheet copied 41 values by hand. Which token format should be the source of truth?

## Considered Options

* The Design Tokens Community Group (DTCG) Format 2025.10
* The project-specific JSON structure

## Decision Outcome

Chosen option: "The Design Tokens Community Group (DTCG) Format 2025.10", because it is the first stable version of a shared token format (a Final Community Group Report, not on the W3C Standards Track), and token tools such as Style Dictionary read it.

* File `design/tokens/siterra.tokens.json`, media type `application/design-tokens+json`.
* Every token has a `$value`, and `$type` is set on the token or its group; tools must not infer the type from the value.
* Colors are objects (`colorSpace: "srgb"`, `components`, with a `hex` fallback); spacing, radii, layout and type sizes are `dimension` objects in `px` or `rem`; durations are `duration` objects in `ms`; easings are `cubicBezier` arrays.
* Type styles are `typography` composites: pixel line heights become multipliers of the font size, and em tracking becomes px per style or stays under `$extensions`.
* Values that are not typed tokens, such as the map camera curve, go under `$extensions` with a key the project controls; data palettes become groups of color tokens.
* The root `$description` carries no version; token versions go in `CHANGELOG.md`.

Specification: [DTCG Format 2025.10](https://www.designtokens.org/tr/2025.10/format/).

### Consequences

* Good, because stylesheet custom properties and the Tailwind theme can be generated from one file instead of copied by hand.
* Good, because the token file can be validated automatically.
* Bad, because two conversions are required: pixel line heights to multipliers, and em tracking to px or an extension value.
* Bad, because Style Dictionary's own documentation describes its 2025.10 support as still in progress; color objects need version 5.3.0, dimension objects 5.4.0 and duration objects 5.7.0, which is usable only once it passes the two-week pin rule.

### Confirmation

A token build or validation of the file under DTCG 2025.10 reports no errors; VC-01 in [acceptance criteria](../project/acceptance-criteria.md) finds no raw color values outside the token definitions; a parity test compares the generated stylesheet values with the tokens.

## Pros and Cons of the Options

### The project-specific JSON structure

* Good, because it needs no conversion.
* Bad, because most leaves are raw values that token tools cannot read as typed tokens, hex strings and em units are not valid 2025.10 values, and the stylesheet copy is kept in sync by hand.
