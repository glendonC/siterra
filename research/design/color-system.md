# Color system: light and dark, computed

Status: research and design proposal, 2026-10-27 (sources accessed 2026-10-26), adopted in ADR-0042. Every value below is computed, not picked by eye; none is user-tested or measured on real terrain imagery. Both themes are complete; dark is the default for the map workspace and light serves exports and bright rooms, with the choice of default left open to the founder (open questions). The repository tokens are generated from this work into [siterra.tokens.json](../../design/tokens/siterra.tokens.json) (srgb with hex, the OKLCH components under `$extensions`, per ADR-0029) and [siterra.css](../../design/tokens/siterra.css); usage rules are in the [design system](../../docs/reference/design-system.md). Labels follow the [planning index](../../docs/README.md#evidence-labels): [V] verified against the cited source on 2026-10-26, [D] decision, [H] hypothesis, [U] unverified.

## Summary

- [D] **One computed hue, OKLCH 215.0, for neutrals and the interactive accent.** It starts from the founder's teal-gray family (chroma-weighted mean hue 189.5) and moves to the point inside that family's own hue span (176.9 to 217.1) that sits farthest from every data color: minimum OKLab distance (x 100) 6.4 at 215.0 against 3.4 at 189.5.
- [D] **Twelve-step scales on the Radix step roles**, with steps 6 to 12 solved for contrast targets against the backgrounds that text and controls actually sit on (the Adobe Leonardo method, implemented in OKLCH).
- [D] **WCAG 2.2 ratios are the pass/fail gate; APCA Lc is an additional design floor.** WCAG 3's working draft of 10 September 2026 states its contrast algorithm "is yet to be determined" [V], so APCA is advisory only.
- [D] **Panels over the map stay opaque.** Text keeps its thresholds over the worst map pixels only at panel opacity 0.91 (light) and 0.92 (dark), and the map remains visibly see-through until 0.972 and 0.982. Translucency buys almost nothing here.
- [D] **Data palettes**: cmocean *speed* adopted for raw NDVI in the light theme (exact published rows, MIT). The other ramps are custom: 16 published maps (18 theme and orientation uses) went through the same tests, and every one not adopted failed a named requirement. Vegetation departure and rainfall departure share one warm "below reference" arm and differ in the other arm (green against blue).
- [D] **Cartography**: neutral relief in the system hue, no hue tint while vegetation data is on screen, two-tone annotation (9:1 between core and casing) so outlines and selections survive any data color, APCA non-text levels for context lines.
- Tokens: Design Tokens Format Module 2025.10 with the Color Module 2025.10 value format (OKLCH components plus hex fallback). Swatch page and screenshots show both themes.

## 1. Sources

All accessed 2026-10-26. Versions are the ones the source showed on that date.

| Source | Version or status | Used for |
|---|---|---|
| [Radix Colors: understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale), [composing a palette](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) | No version shown on the page | Step roles: 1 and 2 app backgrounds, 3 to 5 component backgrounds (normal, hover, pressed or selected), 6 to 8 borders (8 also for focus rings), 9 and 10 solids, 11 and 12 text, with steps 11 and 12 stated to reach Lc 60 and Lc 90 on step 2. Pair the gray whose tint is closest to the accent hue. Semantic pairings are offered as ones that work in Western culture |
| [IBM Carbon color overview](https://carbondesignsystem.com/elements/color/overview/), [tokens](https://carbondesignsystem.com/elements/color/tokens/), [data visualization palettes](https://carbondesignsystem.com/data-visualization/color-palettes/) | Live site | Four themes (White, Gray 10, Gray 90, Gray 100); dark layers one step lighter per layer; hover half a step, selected one step, active two steps; focus at 3:1; text below 24 px at 4.5:1. White theme values such as `$border-strong-01` #8d8d8d (labelled as meeting 3:1 non-text contrast) and `$text-disabled` at 25% alpha. Data: categorical order fixed; sequential palettes put the largest values on the darkest step in light themes and the lightest step in dark themes; diverging palettes do not differ by theme |
| [Atlassian color](https://atlassian.design/foundations/color), [elevation](https://atlassian.design/foundations/elevation) | Live site | Token grammar color.[property].[role].[emphasis].[state]; focus token used only for focus; selected paired with a second cue; 3:1 for non-text and 24 px text, 4.5:1 below. Surfaces sunken, default, raised, overlay; in dark mode higher surfaces are lighter because shadows are harder to see |
| [material-color-utilities](https://github.com/material-foundation/material-color-utilities) (GitHub source; the Material website rendered empty to the fetch tool) | `color_spec_2021.ts`; the library now delegates to a 2026 spec | HCT tone equals L*; contrast is computed from Y. 2021 roles: surface tone 98 light and 6 dark, containers 100 to 90 and 4 to 22, onSurface 10 and 90, outline 50 and 60 with a 3:1 contrast curve at standard contrast, outlineVariant decorative |
| [Adobe Leonardo](https://github.com/adobe/leonardo) | Apache 2.0; README lists LCH, LAB, CAM02, HSL, HSLuv, HSV, RGB interpolation | Generate colors from target contrast ratios against a background. OKLCH is not listed, so Siterra applies the same method with its own OKLCH code |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Technique C40](https://www.w3.org/WAI/WCAG22/Techniques/css/C40) | W3C Recommendation, 12 December 2024 | 1.4.3 (4.5:1; inactive components exempt), 1.4.11 (3:1; boundary only needed when nothing else identifies the control; heat maps may fall under the essential exception), 2.4.13 Focus Appearance (AAA), relative luminance with 0.04045 (changed from 0.03928 in May 2021; no 8-bit value lies between them, so hex results are identical), wide halos count as background, C40 two-tone focus with at least 9:1 between the tones |
| [WCAG 3.0](https://www.w3.org/TR/wcag-3.0/) | Working Draft, 10 September 2026 | "The contrast algorithm used in WCAG 3 is yet to be determined" |
| [apca-w3](https://github.com/Myndex/apca-w3), [APCA in a nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html), [W3C wiki APCA model](https://www.w3.org/WAI/GL/task-forces/silver/wiki/Visual_Contrast_of_Text_Subgroup/APCA_model) | Library 0.1.9, algorithm 0.0.98G-4g; licensed to the W3/AGWG with limitations | Constants and formula. The APCA documentation presents APCA as a candidate method for WCAG 3; the W3C draft has not adopted it. Levels: Lc 90 preferred body, 75 minimum body, 60 other content text, 45 large text and fine icons, 30 floor for any text including placeholder and disabled, 15 floor for discernible non-text |
| [Oklab](https://bottosson.github.io/posts/oklab/) (Ottosson) | Post of 23 December 2020, matrices updated 2021-01-25 | Color space, forward and inverse transforms |
| [CSS Color 4](https://www.w3.org/TR/css-color-4/), [MDN oklch()](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch) | Candidate Recommendation Draft, 26 October 2026; MDN "Widely available", across browsers since May 2023 | `oklch()` syntax; gamut mapping defined as chroma reduction in OkLCh; one Oklab JND is 0.02 (spec changelog) |
| [Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/), [Color Module 2025.10](https://www.designtokens.org/tr/2025.10/color/) | Final Community Group Reports, 28 October 2025, "considered stable" | Token, group and alias syntax; color `$value` object with `colorSpace`, `components`, optional `alpha`, optional `hex`; `.tokens.json` extension |
| [Scientific colour maps](https://www.fabiocrameri.ch/colourmaps/) (Crameri) | 8.0.1, Zenodo [10.5281/zenodo.8409685](https://doi.org/10.5281/zenodo.8409685), 2023-10-05, MIT. Rows read from the [cmcrameri](https://github.com/callumrollo/cmcrameri) mirror of the 8.0 files | Benchmarks: berlin, lisbon, tofino, vanimo (dark centre), vik, broc, bam, bamako |
| [Crameri, Shephard, Heron 2020](https://doi.org/10.1038/s41467-020-19160-7), Nature Communications 11, 5444 ([PMC copy](https://pmc.ncbi.nlm.nih.gov/articles/PMC7595127/)) | CC BY 4.0 | Perceptual uniformity, order, CVD and grayscale readability; always a colour bar; consider the background lightness |
| [cmocean](https://matplotlib.org/cmocean/) (Thyng et al. 2016, Oceanography 29(3)) | PyPI 4.0.3 (2024-04-06); MIT, Copyright (c) 2015 Kristen M. Thyng | speed (adopted), algae, tarn ("for rain anomaly"), diff |
| ColorBrewer ([colorbrewer2.org](https://colorbrewer2.org); Harrower and Brewer 2003, The Cartographic Journal 40(1)) | Exact 7-class schemes from RColorBrewer 1.1.3; Apache-style ColorBrewer licence 1.1 (acknowledgment required if used) | Benchmarks BrBG, YlGn, PuOr, RdBu, PiYG (none adopted) |
| [viridis](https://bids.github.io/colormap/) and [cividis](https://doi.org/10.1371/journal.pone.0199239) | CC0; viridisLite 0.4.2 | Benchmarks |
| [Machado, Oliveira, Fernandes 2009](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html), IEEE TVCG 15(6) | Severity 1.0 matrices checked against the authors' table | CVD simulation |
| NASA Earth Observatory, "Subtleties of Color" parts [1](https://science.nasa.gov/blogs/earth-matters/2013/08/05/subtleties-of-color-part-1-of-6), [2](https://science.nasa.gov/blogs/earth-matters/2013/08/06/subtleties-of-color-part-2-of-6/), [3](https://science.nasa.gov/blogs/earth-matters/2013/08/12/subtleties-of-color-part-3-of-6/), [4](https://science.nasa.gov/blogs/earth-matters/2013/08/19/subtleties-of-color-part-4-of-6/) | 2013, now on science.nasa.gov; the migrated pages do not show an author name (the series is commonly attributed to Robert Simmon) | Lightness is the strongest of hue, saturation and lightness; intuitive colors (green vegetation, gray or beige barren ground, blue water); diverging data uses two hues from a neutral centre, normally white or light gray, because dark centres wash out the extremes |
| [Natural Earth cross-blended hypsometric tints](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/); Patterson and Jenny [2011](https://doi.org/10.14714/CP69.20) and [2014](https://doi.org/10.14714/CP75.578), Cartographic Perspectives | Live page; journal articles | Elevation tints are commonly misread as vegetation or climate regions; the 2014 user study found most participants read tints as both topography and environmental phenomena |
| swisstopo multidirectional hillshade (swissALTI3D), [opendata.swiss record](https://opendata.swiss/en/dataset/swissalti3d-reliefschattierung-multidirektional) | Record returned HTTP 403 to the fetch tool; text read from search index [U] | Six light sources, mean direction north-west |
| [Esri Dark Gray Canvas](https://elevation3d.arcgis.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer?f=pjson) service description | Raster service, mature support | A neutral background with minimal colors, labels and features so thematic content stands out |
| [Microsoft Fluent acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic) | Updated 2026-10-02 | Opaque backgrounds for vertical panes; acrylic for transient surfaces; solid fallback when transparency is off, in battery saver, on low-end hardware and in high contrast; no accent-colored text on acrylic |
| [MDN prefers-reduced-transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency) | Limited availability, experimental (Media Queries Level 5) | Cannot be relied on as the only fallback |
| [MapLibre style spec: sky](https://maplibre.org/maplibre-style-spec/sky/); hillshade properties as recorded in [map assets](../technology/map-assets.md) | Live spec | sky-color default #88C6FC, horizon-color and fog-color #ffffff, fog-ground-blend 0.5, horizon-fog-blend, sky-horizon-blend and atmosphere-blend 0.8 |

Not accessed: Tom Patterson's shadedrelief.com tutorials (HTTP 403, as in the [design source register](source-register.md)), Apple's materials guidance (rendered empty), the ISO safety-color page (HTTP 403, not cited).

## 2. Method

Color math. OKLab forward transform, WCAG relative luminance and the Machado 2009 matrices come from the palette validator helper used in this project's earlier pass; the inverse OKLab transform, APCA, compositing and the solvers were written for this pass. Checks: the OKLab round trip reproduces all 4,096 colors of a 16-level RGB grid exactly in 8 bits; APCA reproduces the six G-4g gray pairs on the W3C wiki within 1 Lc (89.9, 75.9, 60.3, 44.8, 30.1, 15.3 for the listed 90, 75, 60, 45, 30, 15). APCA results are signed: positive is dark text on light, negative is light text on dark; tables show magnitudes. Out-of-gamut colors are brought into sRGB by reducing chroma at constant L and hue, the direction CSS Color 4 uses (Siterra does not apply that spec's local clipping step). Scale chroma is capped at 92% of the sRGB limit and data ramps at 95%, so no published value sits on the gamut edge. Composites (state layers, translucency, data over relief) use source-over in gamma-encoded sRGB, which is what browsers do by default. Distances are OKLab Euclidean distance x 100 ("dE"); 2.0 is one JND.

Thresholds. WCAG 2.2: 4.5:1 text, 3:1 large text and non-text. APCA design floors: Lc 90 primary text, 75 secondary, 60 tertiary and colored text, 30 disabled, 15 separators. Data: the validator's thresholds (CVD dE target 8, floor 6 with mandatory secondary encoding, normal-vision floor 15 for categorical sets, Machado severity 1.0). Those three numbers are the helper's own calibration, not a published standard; they are applied identically to Siterra's ramps and to every published benchmark.

Hue. [D]

| Accent hue | Meaning | Min dE to any data color (both themes) |
|---|---|---|
| 176.9 | founder text-2 hue | 1.8 |
| 185.4 | founder focus hue | 2.8 |
| 189.4 | chroma-weighted mean of the founder's family | 3.4 |
| 207.9 | founder surface hue | 5.7 |
| 214.9 | chosen (215.0) | 6.4 |
| 216.9 | founder bg hue (217.1) | 6.5 |

The founder's colors span hues 176.9 (text-2) to 217.1 (bg). At the family mean, the accent sits 3.4 from the strongest "greener" vegetation class, about 1.7 JND. 215.0 is the flat maximum of the scan (214 to 217 all score 6.4 to 6.5) and lies between the founder's surface (207.9) and background (217.1) hues. Neutrals take the same hue (Radix pairing rule). Danger 28.2 and warning 69.2 keep the founder's danger and caution hues; success 150 and info 250 follow the conventional families Radix lists. No meaning in Siterra depends on hue alone.

Step targets. Persistent backgrounds are the ones text and controls rest on: light steps 1 to 4 (surface and overlay, canvas, subtle, selected), dark steps 1 to 5 (canvas, sunken, surface, overlay, hover inside an overlay). The default surface is light step 1 and dark step 3.

| Step | Radix role | Siterra target |
|---|---|---|
| 1 to 5 | App and component backgrounds | Fixed OKLab L: light 0.993, 0.971, 0.949, 0.927, 0.905 (steps of 0.022, about 1.1 JND); dark 0.198, 0.233, 0.268, 0.303, 0.338 (steps of 0.035, about 1.75 JND, because dark elevation cannot lean on shadows) |
| 6 | Subtle border | APCA Lc >= 15 on every persistent background |
| 7 | Interactive border | OKLab L midpoint of 6 and 8 |
| 8 | Strong border, focus | WCAG >= 3:1 on every persistent background (colored scales: also on their own tints) |
| 9 | Solid | Neutral: L midpoint of 8 and 10. Colored, light theme: lightest fill that still carries white text at >= 4.5:1 and abs(Lc) >= 60 (warning carries dark ink and is solved at its pressed state); dark theme: darkest fill that carries dark ink at the same thresholds |
| 10 | Solid hover | Neutral: tertiary text, >= 4.5:1 and Lc >= 60 on every persistent background. Colored: step 9 moved 0.035 in L toward more label contrast (pressed: 0.070) |
| 11 | Low-contrast text | Neutral: secondary text, >= 7:1 and Lc >= 75 on every persistent background. Colored: >= 4.5:1 and Lc >= 60 on every persistent and own-tint background |
| 12 | High-contrast text | Neutral: Lc >= 90 on every persistent background. Colored: Lc >= 90 on the default surface and its own step 2 |

Neutral chroma follows a curve that never exceeds 0.016 (under one JND from pure gray), which is what "slightly mineral-tinted" means here. Siterra departs from Radix in two places, both for accessibility: neutral step 8 is set by the 3:1 control rule (Radix's step 8 is not a contrast target), and the neutral text tiers sit on steps 10 to 12 so that three text levels all clear 4.5:1.

## 3. Scales

Light theme (hex; full OKLCH components are in the token file):

| Step | neutral | accent | success | warning | danger | info |
|---|---|---|---|---|---|---|
| 1 | `#fafdfe` | `#f9feff` | `#f8fff9` | `#fffcfa` | `#fffcfc` | `#fbfdff` |
| 2 | `#f2f6f7` | `#edf8fa` | `#eef9ef` | `#fef4e8` | `#fef2f1` | `#eff6fe` |
| 3 | `#ebeff0` | `#e1f2f6` | `#e2f4e5` | `#fdebd8` | `#fee9e5` | `#e3f0fe` |
| 4 | `#e3e8e9` | `#d5ebf1` | `#d6eeda` | `#fbe2c8` | `#fddfda` | `#d7e9fd` |
| 5 | `#dbe1e2` | `#c9e5ed` | `#cae9cf` | `#f8dab9` | `#fdd5cf` | `#cae3fd` |
| 6 | `#c2cacd` | `#aacfd8` | `#aad2b1` | `#e9c296` | `#fab8af` | `#aaccf0` |
| 7 | `#9ea8ab` | `#7eaeb9` | `#7eb288` | `#ce9c64` | `#e19085` | `#7faad7` |
| 8 | `#7b868a` | `#4d8d9d` | `#4e935e` | `#b57620` | `#cb655a` | `#4f88c2` |
| 9 | `#6d787b` | `#208195` | `#218744` | `#fbbb70` | `#ce493e` | `#287ac3` |
| 10 | `#5f6a6e` | `#1b7689` | `#1a7c3c` | `#faab45` | `#c23e34` | `#1b6fb8` |
| 11 | `#424d50` | `#1b7183` | `#1d773b` | `#8f5c16` | `#b53e35` | `#226bac` |
| 12 | `#141c1d` | `#234048` | `#23422a` | `#513510` | `#5a2b26` | `#233c57` |
| pressed | | `#176c7d` | `#177036` | `#f19f2d` | `#b63229` | `#1665a8` |
| on solid | | `#ffffff` | `#ffffff` | `#141c1d` | `#ffffff` | `#ffffff` |

Dark theme:

| Step | neutral | accent | success | warning | danger | info |
|---|---|---|---|---|---|---|
| 1 | `#101719` | `#121617` | `#121713` | `#191510` | `#1b1412` | `#12161a` |
| 2 | `#181f21` | `#181f21` | `#182019` | `#241c13` | `#271a18` | `#171e26` |
| 3 | `#1f282a` | `#1c282b` | `#1c2a1f` | `#302314` | `#351f1d` | `#1c2733` |
| 4 | `#273033` | `#203236` | `#213424` | `#3d2a15` | `#432521` | `#203041` |
| 5 | `#30393c` | `#243c42` | `#253e2a` | `#4a3215` | `#522b26` | `#24394f` |
| 6 | `#5a666a` | `#486972` | `#486c4f` | `#805d34` | `#8d554d` | `#486786` |
| 7 | `#687477` | `#4b7985` | `#4b7d56` | `#97682f` | `#a85d53` | `#4b759f` |
| 8 | `#778386` | `#4a8b9a` | `#4b905b` | `#b1731e` | `#c86256` | `#4b84bd` |
| 9 | `#96a0a3` | `#63bcd0` | `#63c37b` | `#ef9e2c` | `#fa9486` | `#71b5f9` |
| 10 | `#b7bfc2` | `#6ec7dc` | `#6fce86` | `#faa940` | `#faa59a` | `#87bffa` |
| 11 | `#d2d8da` | `#7bcadd` | `#7cd08f` | `#faae4d` | `#fba99d` | `#8dc2fa` |
| 12 | `#ebf0f1` | `#cdeff7` | `#cdf2d3` | `#fde5ca` | `#fde3de` | `#d9ebfd` |
| pressed | | `#7ad2e7` | `#7ad990` | `#fbb96c` | `#fbb6ad` | `#9ccafb` |
| on solid | | `#101719` | `#101719` | `#101719` | `#101719` | `#101719` |

Neutral and accent in OKLCH (L, C, H):

| Step | Neutral light | Neutral dark | Accent light | Accent dark |
|---|---|---|---|---|
| 1 | 99.2% 0.003 220 | 19.8% 0.011 217 | 99.4% 0.005 211 | 19.6% 0.007 214 |
| 2 | 97.0% 0.004 214 | 23.3% 0.011 217 | 97.1% 0.012 210 | 23.3% 0.011 217 |
| 3 | 94.9% 0.004 214 | 26.9% 0.013 213 | 95.0% 0.019 213 | 26.7% 0.017 215 |
| 4 | 92.7% 0.006 211 | 30.2% 0.014 220 | 92.6% 0.025 216 | 30.3% 0.025 213 |
| 5 | 90.5% 0.007 209 | 33.7% 0.013 220 | 90.4% 0.032 217 | 33.9% 0.032 215 |
| 6 | 83.4% 0.010 222 | 50.1% 0.016 220 | 83.1% 0.041 214 | 49.9% 0.041 217 |
| 7 | 72.5% 0.012 218 | 55.0% 0.015 214 | 72.1% 0.053 213 | 54.8% 0.054 216 |
| 8 | 61.2% 0.014 222 | 60.1% 0.015 214 | 60.7% 0.070 216 | 60.0% 0.070 215 |
| 9 | 56.4% 0.014 216 | 69.9% 0.012 218 | 55.9% 0.090 215 | 74.7% 0.090 214 |
| 10 | 51.6% 0.015 222 | 79.9% 0.010 222 | 52.4% 0.085 216 | 78.2% 0.090 215 |
| 11 | 41.2% 0.015 216 | 87.8% 0.007 220 | 50.8% 0.082 215 | 79.5% 0.082 215 |
| 12 | 21.9% 0.012 206 | 95.2% 0.006 211 | 35.2% 0.037 217 | 93.0% 0.037 214 |

All scales are monotone in lightness except light warning step 9, which is lighter than step 8 because amber carries dark ink (Radix likewise designs its amber and yellow scales for dark foreground text). Radix's own check passes with margin: on step 2, neutral steps 10, 11 and 12 reach Lc 72, 84 and 98 (light) and 65, 80 and 96 (dark).

## 4. Roles and contrast

Every role is an alias of a scale step (or a computed alpha value). The default surface for panels is light step 1 and dark step 3.

| Role | Light | Dark | Use |
|---|---|---|---|
| bg.canvas | neutral.2 `#f2f6f7` | neutral.1 `#101719` | App ground behind map and panels |
| bg.sunken | neutral.2 `#f2f6f7` | neutral.2 `#181f21` | Wells |
| bg.surface | neutral.1 `#fafdfe` | neutral.3 `#1f282a` | Opaque panels (column, legend, strip) |
| bg.overlay | neutral.1 `#fafdfe` | neutral.4 `#273033` | Menus, popovers, tooltips, dialogs |
| bg.field | neutral.1 `#fafdfe` | neutral.2 `#181f21` | Input fields |
| bg.subtle | neutral.3 `#ebeff0` | neutral.4 `#273033` | Secondary buttons, chips |
| bg.subtle-hover | neutral.4 `#e3e8e9` | neutral.5 `#30393c` | Hover on subtle |
| bg.subtle-pressed | neutral.5 `#dbe1e2` | computed `#384144` | Pressed on subtle (dark: state.pressed over bg.subtle) |
| bg.selected | accent.3 `#e1f2f6` | accent.4 `#203236` | Selected row (with 2 px edge and label) |
| bg.selected-hover | accent.4 `#d5ebf1` | accent.5 `#243c42` | Hover on selected row |
| bg.text-selection | accent.4 `#d5ebf1` | accent.4 `#203236` | Text highlight |
| border.subtle | neutral.6 `#c2cacd` | neutral.6 `#5a666a` | Separators (decorative) |
| border.default | neutral.7 `#9ea8ab` | neutral.7 `#687477` | Panel and container edges (decorative) |
| border.control | neutral.8 `#7b868a` | neutral.8 `#778386` | Control boundaries (3:1) |
| border.control-hover | neutral.9 `#6d787b` | neutral.9 `#96a0a3` | Control boundary on hover |
| border.focus | accent.9 `#208195` | accent.9 `#63bcd0` | Focus ring 2 px, offset 3 px |
| border.selected | accent.9 `#208195` | accent.9 `#63bcd0` | Selected edge 2 px |
| text.primary | neutral.12 `#141c1d` | neutral.12 `#ebf0f1` | Primary text |
| text.secondary | neutral.11 `#424d50` | neutral.11 `#d2d8da` | Secondary text |
| text.tertiary | neutral.10 `#5f6a6e` | neutral.10 `#b7bfc2` | Units, timestamps, IDs |
| text.placeholder | neutral.10 `#5f6a6e` | neutral.10 `#b7bfc2` | Placeholder |
| text.disabled | neutral.7 `#9ea8ab` | neutral.8 `#778386` | Disabled (reason in words) |
| text.link | accent.11 `#1b7183` | accent.11 `#7bcadd` | Links, underlined |
| text.link-hover | accent.12 `#234048` | accent.12 `#cdeff7` | Link hover |
| text.on-accent | fixed `#ffffff` | neutral.1 `#101719` | Label on primary fill |
| icon.default | neutral.11 `#424d50` | neutral.11 `#d2d8da` | Icons |
| icon.subtle | neutral.9 `#6d787b` | neutral.9 `#96a0a3` | Secondary icons |
| interactive.default | accent.9 `#208195` | accent.9 `#63bcd0` | Primary action |
| interactive.hover | accent.10 `#1b7689` | accent.10 `#6ec7dc` | Primary hover |
| interactive.pressed | accent.pressed `#176c7d` | accent.pressed `#7ad2e7` | Primary pressed |
| interactive.subtle-selected | accent.4 `#d5ebf1` | accent.5 `#243c42` | Selected toggle or segment |
| interactive.disabled-bg | neutral.3 `#ebeff0` | neutral.4 `#273033` | Disabled control fill |
| state.hover | `#141c1d` at 0.033 | `#ebf0f1` at 0.043 | Overlay on any surface: one background step |
| state.pressed | `#141c1d` at 0.064 | `#ebf0f1` at 0.088 | Overlay on any surface: two background steps |
| bg.scrim | `#141c1d` at 0.4 | `#101719` at 0.6 | Modal backdrop |
| focus.map (two-tone) | `#141c1d` + `#ffffff` | same | Focus over the map (17.3:1 between tones) |

Status roles:

| Status | fg (text, icon) | bg (banner) | border | solid | on solid |
|---|---|---|---|---|---|
| danger, light | `#b53e35` | `#fee9e5` | `#cb655a` | `#ce493e` | `#ffffff` |
| danger, dark | `#fba99d` | `#351f1d` | `#c86256` | `#fa9486` | `#101719` |
| warning, light | `#8f5c16` | `#fdebd8` | `#b57620` | `#fbbb70` | `#141c1d` |
| warning, dark | `#faae4d` | `#302314` | `#b1731e` | `#ef9e2c` | `#101719` |
| success, light | `#1d773b` | `#e2f4e5` | `#4e935e` | `#218744` | `#ffffff` |
| success, dark | `#7cd08f` | `#1c2a1f` | `#4b905b` | `#63c37b` | `#101719` |
| info, light | `#226bac` | `#e3f0fe` | `#4f88c2` | `#287ac3` | `#ffffff` |
| info, dark | `#8dc2fa` | `#1c2733` | `#4b84bd` | `#71b5f9` | `#101719` |

Light theme contrast, WCAG ratio / APCA Lc (magnitude), for every text and control role on every background it can sit on:

| Role | canvas | surface | overlay | subtle | selected | field | hover (surface) | hover (overlay) | pressed (surface) |
|---|---|---|---|---|---|---|---|---|---|
| text.primary `#141c1d` | 15.90 / 98 | 16.93 / 103 | 16.93 / 103 | 14.95 / 94 | 15.02 / 95 | 16.93 / 103 | 15.90 / 98 | 15.90 / 98 | 14.95 / 94 |
| text.secondary `#424d50` | 8.01 / 84 | 8.53 / 88 | 8.53 / 88 | 7.53 / 80 | 7.57 / 80 | 8.53 / 88 | 8.01 / 84 | 8.01 / 84 | 7.53 / 80 |
| text.tertiary `#5f6a6e` | 5.12 / 72 | 5.45 / 76 | 5.45 / 76 | 4.81 / 68 | 4.83 / 68 | 5.45 / 76 | 5.12 / 72 | 5.12 / 72 | 4.81 / 68 |
| text.disabled `#9ea8ab` | 2.23 / 42 | 2.38 / 46 | 2.38 / 46 | 2.10 / 38 | 2.11 / 38 | 2.38 / 46 | 2.23 / 42 | 2.23 / 42 | 2.10 / 38 |
| text.link `#1b7183` | 5.17 / 72 | 5.50 / 76 | 5.50 / 76 | 4.85 / 68 | 4.88 / 68 | 5.50 / 76 | 5.17 / 72 | 5.17 / 72 | 4.85 / 68 |
| status.danger.fg `#b53e35` | 5.21 / 72 | 5.55 / 76 | 5.55 / 76 | 4.90 / 67 | 4.92 / 68 | 5.55 / 76 | 5.21 / 72 | 5.21 / 72 | 4.90 / 67 |
| status.warning.fg `#8f5c16` | 5.20 / 72 | 5.54 / 76 | 5.54 / 76 | 4.89 / 68 | 4.91 / 68 | 5.54 / 76 | 5.20 / 72 | 5.20 / 72 | 4.89 / 68 |
| status.success.fg `#1d773b` | 5.14 / 72 | 5.47 / 76 | 5.47 / 76 | 4.83 / 68 | 4.86 / 68 | 5.47 / 76 | 5.14 / 72 | 5.14 / 72 | 4.83 / 68 |
| status.info.fg `#226bac` | 5.12 / 72 | 5.45 / 76 | 5.45 / 76 | 4.82 / 68 | 4.84 / 68 | 5.45 / 76 | 5.12 / 72 | 5.12 / 72 | 4.82 / 68 |
| icon.subtle `#6d787b` | 4.18 / 66 | 4.44 / 70 | 4.44 / 70 | 3.92 / 62 | 3.94 / 62 | 4.44 / 70 | 4.18 / 66 | 4.18 / 66 | 3.92 / 62 |
| border.control `#7b868a` | 3.43 / 59 | 3.66 / 63 | 3.66 / 63 | 3.23 / 55 | 3.24 / 55 | 3.66 / 63 | 3.43 / 59 | 3.43 / 59 | 3.23 / 55 |
| border.focus `#208195` | 4.16 / 65 | 4.43 / 70 | 4.43 / 70 | 3.91 / 61 | 3.93 / 62 | 4.43 / 70 | 4.16 / 65 | 4.16 / 65 | 3.91 / 61 |
| border.default `#9ea8ab` | 2.23 / 42 | 2.38 / 46 | 2.38 / 46 | 2.10 / 38 | 2.11 / 38 | 2.38 / 46 | 2.23 / 42 | 2.23 / 42 | 2.10 / 38 |
| border.subtle `#c2cacd` | 1.53 / 23 | 1.63 / 28 | 1.63 / 28 | 1.44 / 19 | 1.44 / 20 | 1.63 / 28 | 1.53 / 23 | 1.53 / 23 | 1.44 / 19 |
| interactive.default `#208195` | 4.16 / 65 | 4.43 / 70 | 4.43 / 70 | 3.91 / 61 | 3.93 / 62 | 4.43 / 70 | 4.16 / 65 | 4.16 / 65 | 3.91 / 61 |
| background hex | `#f2f6f7` | `#fafdfe` | `#fafdfe` | `#ebeff0` | `#e1f2f6` | `#fafdfe` | `#f2f6f7` | `#f2f6f7` | `#ebeff0` |

Dark theme:

| Role | canvas | surface | overlay | subtle | selected | field | hover (surface) | hover (overlay) | pressed (surface) |
|---|---|---|---|---|---|---|---|---|---|
| text.primary `#ebf0f1` | 15.77 / 96 | 13.09 / 94 | 11.73 / 93 | 11.73 / 93 | 11.63 / 92 | 14.53 / 96 | 11.58 / 92 | 10.44 / 91 | 10.14 / 90 |
| text.secondary `#d2d8da` | 12.58 / 81 | 10.45 / 79 | 9.36 / 78 | 9.36 / 78 | 9.28 / 77 | 11.60 / 80 | 9.24 / 77 | 8.33 / 75 | 8.09 / 75 |
| text.tertiary `#b7bfc2` | 9.71 / 66 | 8.06 / 64 | 7.22 / 62 | 7.22 / 62 | 7.16 / 62 | 8.95 / 65 | 7.13 / 62 | 6.43 / 60 | 6.24 / 60 |
| text.disabled `#778386` | 4.64 / 34 | 3.85 / 32 | 3.45 / 30 | 3.45 / 30 | 3.42 / 30 | 4.28 / 33 | 3.41 / 30 | 3.07 / 28 | 2.98 / 28 |
| text.link `#7bcadd` | 9.78 / 67 | 8.12 / 65 | 7.28 / 63 | 7.28 / 63 | 7.22 / 63 | 9.02 / 66 | 7.19 / 63 | 6.48 / 61 | 6.29 / 60 |
| status.danger.fg `#fba99d` | 9.72 / 67 | 8.07 / 64 | 7.24 / 63 | 7.24 / 63 | 7.17 / 62 | 8.96 / 66 | 7.14 / 62 | 6.44 / 61 | 6.25 / 60 |
| status.warning.fg `#faae4d` | 9.69 / 66 | 8.05 / 64 | 7.21 / 63 | 7.21 / 63 | 7.15 / 62 | 8.93 / 66 | 7.12 / 62 | 6.42 / 60 | 6.23 / 60 |
| status.success.fg `#7cd08f` | 9.73 / 67 | 8.08 / 64 | 7.24 / 63 | 7.24 / 63 | 7.18 / 63 | 8.97 / 66 | 7.15 / 62 | 6.44 / 61 | 6.26 / 60 |
| status.info.fg `#8dc2fa` | 9.69 / 66 | 8.05 / 64 | 7.21 / 62 | 7.21 / 62 | 7.15 / 62 | 8.94 / 65 | 7.12 / 62 | 6.42 / 60 | 6.24 / 60 |
| icon.subtle `#96a0a3` | 6.78 / 49 | 5.63 / 47 | 5.04 / 45 | 5.04 / 45 | 5.00 / 45 | 6.25 / 48 | 4.98 / 45 | 4.49 / 43 | 4.36 / 42 |
| border.control `#778386` | 4.64 / 34 | 3.85 / 32 | 3.45 / 30 | 3.45 / 30 | 3.42 / 30 | 4.28 / 33 | 3.41 / 30 | 3.07 / 28 | 2.98 / 28 |
| border.focus `#63bcd0` | 8.32 / 59 | 6.91 / 56 | 6.19 / 55 | 6.19 / 55 | 6.13 / 54 | 7.67 / 58 | 6.11 / 54 | 5.51 / 53 | 5.35 / 52 |
| border.default `#687477` | 3.76 / 27 | 3.12 / 25 | 2.80 / 23 | 2.80 / 23 | 2.77 / 23 | 3.46 / 26 | 2.76 / 23 | 2.49 / 21 | 2.42 / 21 |
| border.subtle `#5a666a` | 3.06 / 21 | 2.54 / 19 | 2.28 / 17 | 2.28 / 17 | 2.26 / 17 | 2.82 / 20 | 2.25 / 17 | 2.03 / 15 | 1.97 / 15 |
| interactive.default `#63bcd0` | 8.32 / 59 | 6.91 / 56 | 6.19 / 55 | 6.19 / 55 | 6.13 / 54 | 7.67 / 58 | 6.11 / 54 | 5.51 / 53 | 5.35 / 52 |
| background hex | `#101719` | `#1f282a` | `#273033` | `#273033` | `#203236` | `#181f21` | `#283133` | `#2f383b` | `#313a3c` |

Solids, tints and other pairs, light:

| Pair | WCAG | APCA Lc |
|---|---|---|
| text.on-accent on interactive.default (`#ffffff` on `#208195`) | 4.53:1 | -76.6 |
| text.on-accent on interactive.hover (`#ffffff` on `#1b7689`) | 5.25:1 | -81.1 |
| text.on-accent on interactive.pressed (`#ffffff` on `#176c7d`) | 6.04:1 | -85.0 |
| status.danger.on-solid on status.danger.solid (`#ffffff` on `#ce493e`) | 4.52:1 | -75.9 |
| status.warning.on-solid on status.warning.solid (`#141c1d` on `#fbbb70`) | 10.25:1 | 72.1 |
| status.success.on-solid on status.success.solid (`#ffffff` on `#218744`) | 4.55:1 | -76.7 |
| status.info.on-solid on status.info.solid (`#ffffff` on `#287ac3`) | 4.50:1 | -76.3 |
| status.danger.fg on status.danger.bg (`#b53e35` on `#fee9e5`) | 4.86:1 | 67.0 |
| text.primary on status.danger.bg (`#141c1d` on `#fee9e5`) | 14.83:1 | 93.7 |
| status.danger.border on status.danger.bg (`#cb655a` on `#fee9e5`) | 3.24:1 | 54.5 |
| status.warning.fg on status.warning.bg (`#8f5c16` on `#fdebd8`) | 4.87:1 | 67.8 |
| text.primary on status.warning.bg (`#141c1d` on `#fdebd8`) | 14.87:1 | 93.9 |
| status.warning.border on status.warning.bg (`#b57620` on `#fdebd8`) | 3.24:1 | 54.7 |
| status.success.fg on status.success.bg (`#1d773b` on `#e2f4e5`) | 4.88:1 | 68.2 |
| text.primary on status.success.bg (`#141c1d` on `#e2f4e5`) | 15.08:1 | 94.8 |
| status.success.border on status.success.bg (`#4e935e` on `#e2f4e5`) | 3.23:1 | 55.2 |
| status.info.fg on status.info.bg (`#226bac` on `#e3f0fe`) | 4.82:1 | 67.6 |
| text.primary on status.info.bg (`#141c1d` on `#e3f0fe`) | 14.97:1 | 94.3 |
| status.info.border on status.info.bg (`#4f88c2` on `#e3f0fe`) | 3.22:1 | 54.8 |
| text.primary on bg.text-selection (`#141c1d` on `#d5ebf1`) | 13.99:1 | 90.0 |
| text.tertiary on bg.text-selection (`#5f6a6e` on `#d5ebf1`) | 4.50:1 | 63.7 |
| interactive.default (fill) vs bg.surface (`#208195` on `#fafdfe`) | 4.43:1 | 69.6 |
| border.selected vs bg.selected (`#208195` on `#e1f2f6`) | 3.93:1 | 61.5 |
| text.primary on bg.selected (`#141c1d` on `#e1f2f6`) | 15.02:1 | 94.6 |
| focus.map-outer vs focus.map-inner (`#141c1d` on `#ffffff`) | 17.30:1 | 104.2 |
| bg.surface vs bg.canvas (`#fafdfe` on `#f2f6f7`) | 1.06:1 | 0.0 |
| bg.overlay vs bg.surface (`#fafdfe` on `#fafdfe`) | 1.00:1 | 0.0 |

Dark:

| Pair | WCAG | APCA Lc |
|---|---|---|
| text.on-accent on interactive.default (`#101719` on `#63bcd0`) | 8.32:1 | 60.1 |
| text.on-accent on interactive.hover (`#101719` on `#6ec7dc`) | 9.38:1 | 65.8 |
| text.on-accent on interactive.pressed (`#101719` on `#7ad2e7`) | 10.53:1 | 71.7 |
| status.danger.on-solid on status.danger.solid (`#101719` on `#fa9486`) | 8.32:1 | 60.2 |
| status.warning.on-solid on status.warning.solid (`#101719` on `#ef9e2c`) | 8.28:1 | 60.0 |
| status.success.on-solid on status.success.solid (`#101719` on `#63c37b`) | 8.31:1 | 60.0 |
| status.info.on-solid on status.info.solid (`#101719` on `#71b5f9`) | 8.35:1 | 60.3 |
| status.danger.fg on status.danger.bg (`#fba99d` on `#351f1d`) | 8.25:1 | -64.5 |
| text.primary on status.danger.bg (`#ebf0f1` on `#351f1d`) | 13.38:1 | -94.5 |
| status.danger.border on status.danger.bg (`#c86256` on `#351f1d`) | 3.91:1 | -32.5 |
| status.warning.fg on status.warning.bg (`#faae4d` on `#302314`) | 8.16:1 | -64.4 |
| text.primary on status.warning.bg (`#ebf0f1` on `#302314`) | 13.27:1 | -94.4 |
| status.warning.border on status.warning.bg (`#b1731e` on `#302314`) | 3.88:1 | -32.2 |
| status.success.fg on status.success.bg (`#7cd08f` on `#1c2a1f`) | 8.05:1 | -64.3 |
| text.primary on status.success.bg (`#ebf0f1` on `#1c2a1f`) | 13.04:1 | -94.2 |
| status.success.border on status.success.bg (`#4b905b` on `#1c2a1f`) | 3.88:1 | -32.5 |
| status.info.fg on status.info.bg (`#8dc2fa` on `#1c2733`) | 8.09:1 | -64.1 |
| text.primary on status.info.bg (`#ebf0f1` on `#1c2733`) | 13.17:1 | -94.3 |
| status.info.border on status.info.bg (`#4b84bd` on `#1c2733`) | 3.85:1 | -32.0 |
| text.primary on bg.text-selection (`#ebf0f1` on `#203236`) | 11.63:1 | -92.5 |
| text.tertiary on bg.text-selection (`#b7bfc2` on `#203236`) | 7.16:1 | -62.3 |
| interactive.default (fill) vs bg.surface (`#63bcd0` on `#1f282a`) | 6.91:1 | -56.3 |
| border.selected vs bg.selected (`#63bcd0` on `#203236`) | 6.13:1 | -54.5 |
| text.primary on bg.selected (`#ebf0f1` on `#203236`) | 11.63:1 | -92.5 |
| focus.map-outer vs focus.map-inner (`#141c1d` on `#ffffff`) | 17.30:1 | 104.2 |
| bg.surface vs bg.canvas (`#1f282a` on `#101719`) | 1.20:1 | 0.0 |
| bg.overlay vs bg.surface (`#273033` on `#1f282a`) | 1.12:1 | 0.0 |

Reading the tables:

- Every text role meets WCAG 1.4.3 on every persistent background in both themes. text.disabled is the deliberate exception (WCAG exempts inactive components) and still reaches Lc 30 or more on the surface and the overlay; the reason for disabling is always written out.
- border.control meets 3:1 on every persistent background. The one value below 3:1 is the dark pressed state on the surface (2.98:1), which lasts only while the pointer is down and does not change the control's outer edge.
- Interactive states: hover and pressed backgrounds are alpha layers of text.primary (light 0.033 and 0.064, dark 0.043 and 0.088) that move any surface by one or two background steps, so they work on panels, overlays and rows alike. Primary fills: light hover and pressed darken; dark hover and pressed lighten; label contrast rises in both.
- Focus: a 2 px ring in accent step 9 with a 3 px offset meets 3:1 on every persistent background (light 4.43:1, Lc 70; dark 6.91:1, Lc 56 on the surface). Over the map, focus uses a two-tone ring (near-black and white at 17.3:1), so at least one tone has 3:1 against any map pixel (computed minimum over terrain and all data classes: 4.51 light, 4.59 dark).
- Selection: selected rows use the accent tint plus a 2 px accent edge and a label (Atlassian: selected needs a second cue). Text selection uses accent step 4; tertiary text stays at 4.50:1 (light) and 7.16:1 (dark) on it.
- Links are accent step 11, always underlined (WCAG 1.4.1), 5.50:1 light and 8.12:1 dark on the surface.

## 5. Floating panels over the map

The redesign floats a few panels over a live map, so the question is whether those panels can be translucent. Computed over every color the map can show (relief extremes, labels, halos, outline and all data classes; backdrop lightness from 0.219 to 1.0 in light and 0.13 to 0.952 in dark):

| Panel opacity needed so that... | Light | Dark |
|---|---|---|
| text.primary keeps >= 7:1 and Lc 90 over the worst pixel | 0.91 | 0.91 |
| text.secondary keeps >= 7:1 and Lc 75 | 0.91 | 0.92 |
| text.tertiary keeps >= 4.5:1 and Lc 60 | 0.91 | 0.92 |
| border.control keeps >= 3:1 | 0.91 | 0.92 |
| the map no longer shows through by a full JND | 0.972 | 0.982 |

[D] Persistent panels (investigation column, legend, temporal strip) stay opaque, as docs/06 already requires: below about 0.97 to 0.98 the terrain texture is visible behind text, and above 0.92 almost nothing of the map is left to see. Backdrop blur removes texture but not regional brightness, so it does not change the worst case. Small transient surfaces over the map (tooltip, context menu) may use opacity 0.94 with a 12 to 16 px blur, in line with Fluent's split between transient surfaces and panes; they must fall back to opaque under `forced-colors` and `prefers-reduced-transparency`, and since the latter has limited browser support, an in-app setting is the reliable switch [H: whether the blur helps users is untested].

## 6. Data palettes

Adoption review. Each candidate was sampled at the seven class centres (published rows where read exactly; otherwise OKLab interpolation between rows about one tenth of the map apart, with error estimated at about 1.4 dE or less, a quarter of the worst error measured at twice that spacing) and run through the tests below against the map ground of its theme.

| Candidate (theme) | Type | Result under Siterra's tests | Why not adopted, or adopted |
|---|---|---|---|
| cmocean speed (adopted) (light) | sequential | monotone yes; min dL 0.098; adjacent dE 10.5, CVD 8.4, tritan 9.9; hues 99 to 150 | Adopted for light NDVI: best adjacent separation among candidates, straw-to-green path matches 'barren to vegetated' |
| Crameri bamako, reversed (light) | sequential | monotone yes; min dL 0.051; adjacent dE 6.9, CVD 6.8, tritan 4.5; hues 95 to 193 | Dark end compressed (smallest dL 0.051) and ends in teal |
| cmocean algae (light) | sequential | monotone yes; min dL 0.094; adjacent dE 9.7, CVD 9.2, tritan 9.1; hues 139 to 153 | All-green path: low NDVI would read as some vegetation |
| ColorBrewer YlGn (light) | sequential | monotone yes; min dL 0.067; adjacent dE 7.9, CVD 6.1, tritan 6.4; hues 108 to 156 | Weaker adjacent CVD separation |
| ColorBrewer BrBG (light) | diverging | opposite CVD 4.9, 10.8, 9.7; asymmetry 0.071; dry or negative hues [90, 85, 63]; positive [186, 188, 185] | Near-zero pair below the CVD floor; teal arm sits on the UI accent family |
| cmocean tarn (light) | diverging | opposite CVD 4.4, 11.4, 13.0; asymmetry 0.016; dry or negative hues [59, 83, 125]; positive [133, 192, 244] | Driest class is olive green; near-zero pair below the CVD floor |
| cmocean diff, reversed (light) | diverging | opposite CVD 4.5, 9.8, 11.6; asymmetry 0.010; dry or negative hues [88, 93, 108]; positive [248, 240, 244] | Near-zero pair below the CVD floor; olive-khaki dry arm |
| Crameri vik, reversed (light) | diverging | opposite CVD 9.8, 16.9, 18.0; asymmetry 0.083; dry or negative hues [50, 47, 33]; positive [231, 241, 259] | Strong CVD separation, but the driest class is brick red (the design rule bans a red damage reading) |
| Crameri broc, reversed (light) | diverging | opposite CVD 12.4, 15.8, 14.8; asymmetry 0.087; dry or negative hues [108, 108, 109]; positive [247, 250, 271] | Arm asymmetry dL 0.087 (wet looks stronger than dry); olive dry arm |
| Crameri bam (light) | diverging | opposite CVD 8.3, 12.7, 11.6; asymmetry 0.037; dry or negative hues [336, 338, 341]; positive [127, 132, 138] | Magenta for 'less green' is not an intuitive vegetation reading |
| Crameri bamako (dark) | sequential | monotone yes; min dL 0.051; adjacent dE 6.9, CVD 6.8, tritan 4.5; hues 193 to 95 | Dark theme: high NDVI would be light tan, the reverse of the reading |
| cmocean algae, reversed (dark) | sequential | monotone yes; min dL 0.094; adjacent dE 9.7, CVD 9.2, tritan 9.1; hues 153 to 139 | Dark theme: low NDVI would be dark green |
| viridis (dark) | sequential | monotone yes; min dL 0.097; adjacent dE 12.3, CVD 8.1, tritan 9.7; hues 318 to 102 | Purple-to-yellow path carries no vegetation meaning |
| cividis (dark) | sequential | monotone yes; min dL 0.106; adjacent dE 11.1, CVD 10.7, tritan 10.4; hues 257 to 102 | Blue-to-yellow path carries no vegetation meaning |
| Crameri lisbon, reversed (dark) | diverging | opposite CVD 10.7, 14.2, 11.8; asymmetry 0.059; dry or negative hues [99, 100, 104]; positive [250, 253, 268] | Closest fit for dark rainfall (dark centre, straw and blue); arm asymmetry 0.059 and centre darker than the map land; custom ramp is symmetric |
| Crameri berlin, reversed (dark) | diverging | opposite CVD 10.5, 15.7, 15.0; asymmetry 0.069; dry or negative hues [41, 36, 25]; positive [234, 233, 253] | Centre tinted (C 0.024); red dry arm |
| Crameri vanimo (dark) | diverging | opposite CVD 7.7, 13.5, 14.6; asymmetry 0.020; dry or negative hues [337, 336, 332]; positive [128, 129, 132] | Magenta for 'less green' |
| Crameri tofino, reversed (dark) | diverging | opposite CVD 10.7, 17.4, 15.3; asymmetry 0.023; dry or negative hues [146, 144, 129]; positive [262, 264, 276] | Blue for 'less green'; low tritan separation |

Final palettes. Seven classes; fixed domains stated in every legend; never rescaled per period.

| Palette | Theme | Classes, low to high (or -3 to +3) |
|---|---|---|
| NDVI raw | light | `#f3e7a7` `#d4c157` `#a0a818` `#60920c` `#217825` `#0e572d` `#19341f` |
| NDVI raw | dark | `#3e3504` `#584d09` `#676c0f` `#619116` `#5fb25e` `#86ca99` `#bedec3` |
| NDVI departure | light | `#a26112` `#c79150` `#e7c293` `#f5f7f8` `#97d9c1` `#4eb293` `#16866a` |
| NDVI departure | dark | `#f2a85f` `#b27d3b` `#745426` `#2d3132` `#266854` `#379d7f` `#57d4ae` |
| Rainfall departure | light | `#a26112` `#c79150` `#e7c293` `#f5f7f8` `#a0cff7` `#6ba1dc` `#4273bb` |
| Rainfall departure | dark | `#f2a85f` `#b27d3b` `#745426` `#2d3132` `#345f82` `#588dc7` `#92bcfc` |
| Categorical | light | `#cb5a1a` `#6b359b` `#1a9388` + other `#6d787b` (patterned) |
| Categorical | dark | `#cb5a1a` `#8b57be` `#20ab9e` + other `#96a0a3` (patterned) |

- NDVI, light: cmocean *speed*, exact rows 19, 56, 92, 128 and 129 averaged, 165, 201, 238 of `speed-rgb.txt` (MIT; ship the notice). Low NDVI is pale straw, high is dark green.
- NDVI, dark: custom. It keeps speed's hue path and chroma where the gamut allows and runs lightness from 0.33 to 0.87, so bare ground recedes into the dark map and vegetation glows (Carbon's rule for dark themes: lightest means largest). Same MIT notice, since it derives from speed.
- Departures: custom, built in OKLCH. Centre: neutral (C 0.003 light, 0.006 dark) at L 0.975 (light) or 0.31 (dark). Arms: L steps of 0.14 (light, darker outward) or 0.16 (dark, lighter outward), chroma 0.075, 0.105, 0.125. Shared warm arm hues 74, 70, 64 (tan to ochre; never red, per docs/06). Vegetation arm hue 170 (green); rainfall arm hues 245, 252, 258 (blue). The hues come from a search for the greenest arm that still clears the CVD target against the warm arm.
- Why the dark theme uses a dark centre although NASA's guidance prefers a light one: on a dark map a near-white centre would make "no change" the brightest thing on screen, and the dark-centre maps in Crameri's collection (berlin, lisbon, tofino, vanimo, centres at L 0.17 to 0.21 by computation) show the construction is established. The cost NASA's guide names, washed-out extremes, is limited by stopping the extremes at L 0.79, where the warm and green extremes keep chroma 0.125 and the blue extreme 0.102.

Validation. The validator's ordinal mode is not used for these ramps because it requires a single hue; the NDVI ramps change hue by design (as speed does), so monotone lightness and adjacent separation are tested directly.

| Check | NDVI light | NDVI dark | NDVI dep. light | NDVI dep. dark | Rain dep. light | Rain dep. dark |
|---|---|---|---|---|---|---|
| Lightness monotone (per arm for diverging) | yes | yes | yes | yes | yes | yes |
| L range | 0.30 to 0.92 | 0.33 to 0.87 | 0.55 to 0.97 | 0.31 to 0.79 | 0.55 to 0.97 | 0.31 to 0.79 |
| Smallest adjacent dL / arm asymmetry dL | 0.098 | 0.090 | 0.001 | 0.002 | 0.002 | 0.001 |
| Adjacent dE, normal vision (min) | 10.5 | 9.2 | 14.1 | 16.0 | 14.2 | 15.9 |
| Adjacent dE, protan or deutan (min) | 8.4 | 8.1 | 12.0 | 14.9 | 13.4 | 14.9 |
| Adjacent dE, tritan (min) | 9.9 | 9.0 | n/a | n/a | n/a | n/a |
| Opposite classes, k = 1, 2, 3 each side, protan or deutan | n/a | n/a | 6.3, 9.2, 10.2 | 6.6, 9.2, 10.5 | 13.6, 19.5, 22.9 | 13.9, 19.7, 21.2 |
| Opposite classes, tritan | n/a | n/a | 15.1, 21.9, 22.2 | 14.9, 21.2, 26.0 | 15.3, 20.9, 22.1 | 14.9, 21.0, 21.5 |
| Low class or centre vs own map land, dE | 8.6 | 10.7 | 4.1 | 6.1 | 4.1 | 6.1 |
| WCAG vs own map land, min to max | 1.03 to 11.17 | 1.31 to 10.98 | 1.13 to 4.07 | 1.22 to 8.70 | 1.13 to 4.07 | 1.22 to 8.24 |
| WCAG vs the other theme's map land | 1.18 to 12.79 | 1.20 to 10.10 | 3.24 to 14.88 | 1.52 to 10.85 | 3.24 to 14.88 | 1.60 to 10.85 |
| Minimum raster opacity that keeps class order over the full relief range | 0.83 | 0.75 | 0.74 | 0.63 | 0.74 | 0.63 |

What this means:

- Opposite-sign classes stay apart under protanopia and deuteranopia simulation at k = 2 and 3 (each side of zero) for both variables. The weakest pair is the first vegetation class either side of zero (dE 6.3 light, 6.6 dark): inside the 6 to 8 floor band, which is allowed only with secondary encoding. The legend, value readout and table view are therefore mandatory, as docs/06 already states.
- Rainfall and vegetation arms differ from each other by dE 9.1, 13.7, 15.9 (light, k = 1 to 3), so a viewer can tell which variable is on screen.
- Raster opacity: with relief exaggeration at its orientation value, class order survives the full shadow-to-highlight range at opacity 0.83 or more (the strictest case, light NDVI). Specify 0.90 (token `data.opacity`), slightly above docs/06's "about 85%".
- Contrast against map grounds: departure centres are deliberately close to the ground (WCAG 1.13 to 1.22:1, dE 4.1 to 6.1) so "no change" recedes; the extremes reach 4.07:1 (light) and 8.70:1 (dark). WCAG 1.4.11 treats measurement gradients such as heat maps under its essential exception, so legibility rests on the legend and table, not on a 3:1 rule per class. The palettes are theme-specific: on the other theme's ground the low or centre classes invert their emphasis (see the last WCAG row), which is why each theme has its own set.

Categorical (strata or series). Three hued slots and a neutral fourth:

| Slot | Light | Dark | Hue |
|---|---|---|---|
| 1 | `#cb5a1a` | `#cb5a1a` | 45 orange |
| 2 | `#6b359b` | `#8b57be` | 305 purple |
| 3 | `#1a9388` | `#20ab9e` | 185 teal |
| other | `#6d787b` | `#96a0a3` | neutral, always dashed or patterned |

Search: every hue triple outside the reserved zones (accent +-20 degrees, danger +-12, vegetation greens 90 to 180, the warm arm 54 to 78, the rain blue core 244 to 260), lightness inside the validator bands, chroma >= 0.10, >= 3:1 on the panel surface and the map land in both themes. Result, all pairs: CVD dE 14.0 (light) and 14.9 (dark), normal vision 24.6 and 24.8; the validator CLI run with `--pairs all` against the real panel surfaces reports all checks passing in both modes. No four-hue set passes every gate in the dark theme once the panel surface is the real one (the usable lightness band shrinks to about 0.56 to 0.67), so a fourth stratum folds into the neutral slot, which is not separable from slot 3 by color under CVD simulation (dE 1.2 dark) and therefore always carries a dash or pattern. Strata on the map remain outlines with pattern fills, as docs/06 requires.

No data and excluded. No observation: 45 degree hatch, neutral step 10, 1 px at 6 px spacing (4.59:1 light, 8.56:1 dark on the map land; at least 8.5 dE from every data class). Excluded stratum: 135 degree hatch, neutral step 8 (3.08:1 and 4.09:1), reason in the legend. Neither is ever a value color.

Status colors against data colors. Status hues share families with the data (green vegetation and success, ochre dryness and warning, blue water and info), and no hue shift inside conventional ranges separates them: the best warning hue between 60 and 100 gains less than one JND in the light theme. Measured distances:

| Status step | Light: nearest data color, dE | Dark: nearest data color, dE |
|---|---|---|
| accent-9 | `#208195` vs `#1a9388`: 6.4 | `#63bcd0` vs `#92bcfc`: 8.5 |
| accent-11 | `#1b7183` vs `#16866a`: 8.7 | `#7bcadd` vs `#92bcfc`: 7.2 |
| danger-9 | `#ce493e` vs `#cb5a1a`: 5.2 | `#fa9486` vs `#f2a85f`: 7.8 |
| danger-11 | `#b53e35` vs `#cb5a1a`: 8.4 | `#fba99d` vs `#f2a85f`: 7.6 |
| warning-9 | `#fbbb70` vs `#e7c293`: 4.4 | `#ef9e2c` vs `#f2a85f`: 4.0 |
| warning-11 | `#8f5c16` vs `#a26112`: 3.9 | `#faae4d` vs `#f2a85f`: 2.8 |
| success-9 | `#218744` vs `#217825`: 5.0 | `#63c37b` vs `#5fb25e`: 5.2 |
| success-11 | `#1d773b` vs `#217825`: 2.4 | `#7cd08f` vs `#86ca99`: 2.7 |
| info-9 | `#287ac3` vs `#4273bb`: 2.5 | `#71b5f9` vs `#92bcfc`: 4.2 |
| info-11 | `#226bac` vs `#4273bb`: 4.3 | `#8dc2fa` vs `#92bcfc`: 1.7 |

[D] Rule: status colors never appear on the map or in a legend, data colors never mark state, and every status carries an icon and words. Success and info stay rare by design (completed work is neutral), and info notes may use the neutral treatment with an icon.

## 7. Cartography

| Token | Light | Dark | Rule |
|---|---|---|---|
| map.land | `#e6eaeb` | `#1b2325` | Flat ground under the hillshade; mineral hue, near neutral |
| map.hillshade-shadow | `#7e888b` | `#04080a` | Deepest shadow (worst case for data) |
| map.hillshade-highlight | `#ffffff` | `#454f51` | Brightest highlight |
| map.hillshade-accent | `#7e888b` | `#04080a` | Standard method only |
| map.water-line | `#8ab5d0` | `#568099` | APCA Lc 30 on land |
| map.road-minor | `#bbc3c6` | `#5e6667` | Lc 20 on land |
| map.road-major | `#a7b1b4` | `#737d7f` | Lc 30 on land |
| map.contour | `#d1cbb6` | `#5e5846` | Lc 15 on land, founder's mineral hue |
| map.contour-index | `#c0b8a0` | `#777059` | Lc 25 on land |
| map.label | `#424d50` | `#d2d8da` | Neutral 11 |
| map.label-major | `#141c1d` | `#ebf0f1` | Neutral 12 |
| map.label-halo | `#ffffff` | `#101719` | Halo; WCAG treats a wide halo as the background |
| map.outline-casing | `#ffffff` | `#101719` | Casing under the outline |
| map.no-data-hatch | `#5f6a6e` | `#b7bfc2` | 45 degree hatch |
| map.excluded-hatch | `#7b868a` | `#778386` | 135 degree hatch |
| map.selection-core | `#141c1d` | `#ebf0f1` | Selected feature core |
| map.selection-casing | `#ffffff` | `#101719` | Selected feature casing |
| map.sky | `#f2f6f7` | `#101719` | sky-color |
| map.horizon | `#fafdfe` | `#1f282a` | horizon-color |
| map.fog | `#f2f6f7` | `#181f21` | fog-color |
| map.context-dim | `#ffffff` at 0.55 | `#101719` at 0.5 | Mask outside the analysis geometry |
| map.outline | `#544820` | `#c4b78b` | Catchment core; >= 9:1 to its casing |
| map.grid-stroke | `#141c1d` | `#b7bfc2` | Rainfall cell edge |
| map.grid-casing | none | `#101719` | Dark theme casing (two-tone) |
| chart.grid | `#c2cacd` | `#5a666a` | Hairline grid |
| chart.axis | `#7b868a` | `#778386` | Axes and ticks |
| chart.label | `#5f6a6e` | `#b7bfc2` | Axis labels |
| chart.reference | `#424d50` | `#d2d8da` | Reference line (dotted) |
| chart.series-vegetation | `#217825` | `#5fb25e` | One vegetation line |
| chart.series-rainfall | `#4273bb` | `#588dc7` | One rainfall line |
| chart.departure-below | `#a26112` | `#b27d3b` | Bars below reference |
| chart.departure-above-vegetation | `#16866a` | `#379d7f` | Vegetation bars above |
| chart.departure-above-rainfall | `#4273bb` | `#588dc7` | Rainfall bars above |

Checks:

| Check | Light | Dark |
|---|---|---|
| map.water-line vs land | 1.81:1, Lc 30.1 | 3.76:1, Lc 30.0 |
| map.road-minor vs land | 1.48:1, Lc 20.2 | 2.72:1, Lc 20.0 |
| map.road-major vs land | 1.81:1, Lc 30.2 | 3.78:1, Lc 30.1 |
| map.contour vs land | 1.34:1, Lc 15.0 | 2.25:1, Lc 15.0 |
| map.contour-index vs land | 1.63:1, Lc 25.4 | 3.23:1, Lc 25.1 |
| map.no-data-hatch vs land | 4.59:1, Lc 64.9 | 8.56:1, Lc 64.8 |
| map.excluded-hatch vs land | 3.08:1, Lc 52.1 | 4.09:1, Lc 32.8 |
| map.outline vs land | 7.46:1, Lc 77.8 | 7.99:1, Lc 61.2 |
| map.label vs halo | 8.72:1, Lc 89.9 | 12.58:1, Lc 81.3 |
| map.label-major vs halo | 17.30:1, Lc 104.2 | 15.77:1, Lc 96.5 |
| map.outline vs casing | 9.03:1, Lc 90.7 | 9.06:1, Lc 62.7 |
| map.selection-core vs casing | 17.30:1, Lc 104.2 | 15.77:1, Lc 96.5 |
| grid: best single neutral, worst class WCAG | 3.98 | 1.68 |
| grid stroke (two-tone if cased): worst class WCAG | 3.51 | 3.62 |
| catchment outline two-tone: worst WCAG over terrain and all data classes | 3.27 | 3.22 |
| selection two-tone: worst WCAG over terrain and all data classes | 4.51 | 4.81 |
| map focus two-tone: worst WCAG over terrain and all data classes | 4.51 | 4.59 |
| panel surface vs map land | 1.19:1, Lc 10.4 | 1.06:1, Lc 0.0 |
| panel border.default vs map land | 2.01:1, Lc 35.0 | 3.31:1, Lc 25.8 |
| chart.grid vs chart surface | 1.63:1, Lc 27.7 | 2.54:1, Lc 19.0 |
| chart.axis vs chart surface | 3.66:1, Lc 63.4 | 3.85:1, Lc 32.0 |
| chart.label vs chart surface | 5.45:1, Lc 76.3 | 8.06:1, Lc 64.0 |
| chart.reference vs chart surface | 8.53:1, Lc 88.4 | 10.45:1, Lc 79.1 |
| chart.series-vegetation vs chart surface | 5.44:1, Lc 75.8 | 5.75:1, Lc 47.9 |
| chart.series-rainfall vs chart surface | 4.67:1, Lc 71.3 | 4.34:1, Lc 36.4 |
| chart.departure-below vs chart surface | 4.83:1, Lc 72.3 | 4.22:1, Lc 35.4 |
| chart.departure-above-vegetation vs chart surface | 4.42:1, Lc 69.4 | 4.51:1, Lc 38.0 |
| chart.departure-above-rainfall vs chart surface | 4.67:1, Lc 71.3 | 4.34:1, Lc 36.4 |
| map.outline worst vs data class | 1.04 | 1.0 |
| map.casing worst vs data class | 1.07 | 1.38 |
| no-data hatch worst vs data class dE | 10.2 | 8.5 |
| water-line vs rain wet extreme dE | 20.9 | 21.7 |
| context-dim terrain range WCAG (before -> after) | 3.63 to 1.67 | 2.38 to 1.48 |

Decisions and evidence:

- **Relief** [D]: monochrome in the system hue (Esri's neutral-background principle; the reference manifest's "mineral ground, measured color"). Multidirectional light with a north-west mean, as swisstopo's six-source product uses [U for the exact swisstopo parameters]. The token values are the extremes the hillshade may reach; MapLibre's exaggeration (about 0.58 for orientation, about 0.4 with data, per docs/06) sets how far toward them a pixel goes. Tune in the prototype against the computed raster-opacity floor above.
- **Terrain tint** [D]: none while any vegetation layer is visible. Natural Earth and Patterson and Jenny document that readers take elevation colors as vegetation or climate; on a vegetation product that confusion is direct. An optional lightness-only ramp (achromatic, no more than 0.03 L either way, set from DEM percentiles) may support orientation when no data is shown [H].
- **Context lines** [D]: water Lc 30, major roads Lc 30, minor roads Lc 20, contours Lc 15 and index contours Lc 25 against the land. APCA's non-text floors give quiet but discernible linework, so data stays dominant. Water is a desaturated blue (hue 235, C 0.06) that sits 20.9 dE (light) and 21.7 dE (dark) from the wettest rain class and differs in mark type (line against cell).
- **Labels and halos** [D]: neutral steps 11 and 12 on a halo of white (light) or the canvas (dark). WCAG treats a wide halo as the label's background, so the computed label-to-halo ratios (8.72:1 light, 12.58:1 dark) hold over any terrain. Use a halo of at least 1.5 px with little blur on 12 px condensed labels.
- **Catchment outline** [D]: founder's mineral hue, core solved to 9:1 against its casing (technique C40's two-tone logic), so at least one stroke has 3:1 against any pixel (3.27 light, 3.22 dark worst case over relief and every data class).
- **Rainfall grid** [D]: no single gray reaches 3:1 against all seven dark-theme rain classes (best 1.68:1), so the dark grid is a cased line (neutral 10 over a 3 px neutral 1 casing, worst 3.62:1). In light, a single neutral-12 hairline reaches 3.51:1 against every class.
- **Selection on the map** [D]: two-tone (neutral 12 core, halo-colored casing), never the accent, so selection never competes with a data hue.
- **Context outside the analysis geometry** [D]: canvas color at 0.5 (dark) or white at 0.55 (light), which cuts the relief's internal contrast from 2.38:1 to 1.48:1 (dark) and 3.63:1 to 1.67:1 (light).
- **Sky and fog** [D]: sky, horizon and fog are neutral steps (dark: canvas, surface, sunken; light: canvas, surface, canvas), replacing MapLibre's blue default sky so distant relief fades into the app ground and no hue competes with data. Keep MapLibre's default blends (fog-ground-blend 0.5, horizon-fog-blend 0.8, sky-horizon-blend 0.8) as the starting point; atmosphere-blend matters mainly for the globe projection, so set it in the prototype [U].

## 8. Usage rules

1. Use role tokens, never palette steps, in components. Palette steps exist for the token file and for new roles.
2. Text: primary for the record, secondary for descriptions and method lines, tertiary for units, timestamps and IDs. Never put text on a background outside the tables in section 4 without computing it.
3. Disabled controls show the reason in words; disabled text is not used for anything the user must read to proceed.
4. Interactive accent appears only on things that act: primary fill, link, focus ring, selected edge. Not on charts or maps.
5. Status colors appear only in panels, always with icon and words. Never on the map.
6. Data colors appear only in data marks and their legends. Every map raster and chart keeps its legend, values and table view; the near-zero vegetation pair depends on them.
7. Panels over the map are opaque. Transient overlays may be 0.94 with blur, with an opaque fallback.
8. On the map, anything drawn over data (outline, selection, focus, grid in dark) is two-tone.
9. No elevation hue tint while vegetation data is visible.
10. The categorical neutral 'other' slot always carries a dash or pattern; strata keep pattern fills.
11. Ship the MIT notice for cmocean (speed) with the tokens. Scientific colour maps and ColorBrewer were benchmarked, not used; no notice needed unless that changes.

## 9. Enterprise fit

- **Structure** follows what large design systems converge on: a neutral ramp carries the interface, one interactive color, semantic scales for state, and separate data palettes (Carbon's interactive blue and separate data-viz palettes; Atlassian's role, emphasis and state token grammar; Material's tone-based roles with a 3:1 outline and a decorative outline variant; Radix's twelve-step roles). Siterra's token names follow the same role, emphasis and state grammar.
- **Contrast discipline** goes further than these systems' defaults in two places, both computed: all three text tiers, placeholder included, clear 4.5:1 on every background they can sit on, and control borders clear 3:1 on hover and selected rows, not only on the base surface. For comparison, Carbon's White-theme placeholder (Gray 100 at 40% alpha) composites to about 2.55:1 on white.
- **Dark mode** follows Atlassian and Carbon: higher surfaces are lighter and shadows are not relied on. Dark solids carry dark ink, as in Material's 2021 roles (primary tone 80 with on-primary tone 20) and the founder's original primary fill.
- **Color meaning** is kept narrow on purpose. The accent hue is chosen for continuity with the founder's palette and measured distance from data, not for an association such as "teal means trust" or "green means environment"; no such claim is made here because no evidence was found for it. Green is not the brand color because green is vegetation data on this map. Red-for-danger, amber-for-warning conventions are documented by Radix as working "in Western culture"; because Siterra's audience includes Moroccan stakeholders and readers with color-vision deficiency, meaning always rides on icon and words, with color as reinforcement.
- **Map** follows Esri's thematic basemap principle (neutral ground, minimal color, data carries hue) and the cartographic literature on hypsometric tints.

## 10. Changes from the founder's palette

| Founder | Now | Why |
|---|---|---|
| bg `#101719` | dark bg.canvas `#101719` | Unchanged: dark step 1 lands on it exactly |
| surface `#1C292B` | dark bg.surface `#1f282a` | dE 0.5; same lightness, hue unified to 215 |
| elevated `#263638` | dark bg.overlay `#273033` | One elevation step above the surface |
| scrim `#0B1012` | label halo `#101719`; modal scrim `#101719` at 0.6 | Halo reuses the canvas; modal scrim gets its own alpha token |
| text `#E8ECE8` | dark text.primary `#ebf0f1` | Lc 94 on surface (was 92); hue unified |
| text-2 `#A9B7B3` | dark text.secondary `#d2d8da` | Was Lc 58 on surface; secondary text now meets 7:1 and Lc 75 everywhere it sits |
| text-muted `#929E9D` | dark text.tertiary `#b7bfc2` | Was 4.56:1 but Lc 42 on elevated; now >= 6.24:1 and Lc >= 60 on every persistent background |
| border-subtle `#344548` | dark border.subtle `#5a666a` | Was 1.49:1 (Lc below 15, not discernible by APCA's floor for dividers); now Lc >= 15 on every background |
| border-control `#697D7F` | dark border.control `#778386` | Was 2.90:1 on elevated; now >= 3:1 on canvas, surface, overlay and hover |
| focus `#9BBDB8` | accent: dark `#63bcd0`, light `#208195` | Hue 185 to 215 and chroma 0.037 to 0.090: at 185.5 to 189.5 the accent sits 2.8 to 3.4 dE from the strongest 'greener' vegetation class, and 0.037 chroma reads close to the neutrals |
| mineral `#B3AA8C` | map outline dark `#c4b78b` / light `#544820`; contours | Kept as the cartographic annotation hue (93.6); lightness set for 9:1 against the casing |
| ecological `#708E76` | retired from the UI | Green belongs to vegetation data; a green UI accent would read as data |
| caution `#D5A36A` | warning scale (hue 69.2 kept), dark solid `#ef9e2c`, text `#faae4d` | Same hue, now a full 12-step scale with solved text and solid steps |
| danger `#E4887C` | danger scale (hue 28.2 kept), dark solid `#fa9486`, text `#fba99d` | Same hue, full scale |
| NDVI ramp (custom brown to green, dark) | light: cmocean speed; dark: speed hue path, L 0.33 to 0.87 | Published ramp adopted where it fits; dark keeps the founder's 'low recedes' logic with a wider lightness range |
| NDVI anomaly, teal-green arm (hue 175) | green arm hue 170; warm arm kept and shared | Moved 5 degrees toward green: a greener reading and more distance from the light accent (dE 7.5 against 6.6 at hue 175) and the strata teal, at a small CVD cost (opposite classes at k = 2 and 3: 9.2 and 10.2 instead of 9.9 and 11.0, both above the target of 8) |
| Rain anomaly, blue arm | blue arm 245 to 258, warm arm shared | Light-theme version added; centre and arms recomputed |

What did not change: the dark ground and panel colors, the mineral annotation hue, the caution and danger hues, the opaque-panel rule, the shared warm "below reference" arm, the hatch conventions for missing and excluded data, and the rule that status always carries icon and words.

## 11. Open choices for the founder

1. Light or dark. Both themes are complete and pass the same gates. Dark keeps the founder's ground and suits the relief-first arrival; light reads more like enterprise document tools and prints closer to the brief export. Decide after seeing both screenshots.
2. Accent hue. 215.0 (steel teal) is the computed recommendation. Keeping the founder's 185.5 costs measured distance from the data (2.8 dE to the strongest 'greener' vegetation class, against 6.4) and would require moving the vegetation arm.
3. Dark text tiers. APCA floors on every background push dark secondary and tertiary text up to L 0.88 and 0.80, so the tiers are 0.07 to 0.08 apart in lightness and rely on size and weight for hierarchy. Relaxing the secondary floor from "every background" to "the default surface" would widen the gap slightly; WCAG compliance holds either way.
4. Strata count. Three colored strata plus a patterned 'other'. If four strata must be equally prominent, they need patterns as the primary channel.
5. Translucent transient overlays. Opaque everywhere is the safe default; 0.94 with blur for tooltips and menus over the map is allowed by the numbers but untested with users.

## 12. Files and reproduction

The token file (`color.tokens.json`, DTCG 2025.10, light and dark), the self-contained swatch page and its two screenshots, and the Python scripts that compute every number in this document were produced in a working folder outside the repository, as this planning pass did not edit other repository files. To adopt: place the token file under `design/assets/`, point docs/06 at this document, and keep the cmocean MIT notice with it. The scripts need Python 3 and the palette validator helper (`validate_palette.py`, for forward OKLab, WCAG luminance and the Machado matrices); NumPy and Matplotlib are not required. ColorBrewer and viridis reference values came from RColorBrewer 1.1.3 and viridisLite 0.4.2 on the working machine. Re-running them reproduces every table here.
