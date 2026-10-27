# Design system

The visual rules for Siterra: color, data palettes, type, geometry, states, icons, cartography and motion. Tokens: [siterra.tokens.json](../../design/tokens/siterra.tokens.json) (DTCG 2025.10, [ADR-0029](../decisions/0029-store-design-tokens-in-the-dtcg-format.md)); generated stylesheet for prototypes: [siterra.css](../../design/tokens/siterra.css); computed contrast: [contrast-report.json](../../design/tokens/contrast-report.json). Color method and evidence: [color system research](../../research/design/color-system.md). Decisions: [ADR-0009](../decisions/0009-adopt-the-mineral-relief-visual-direction.md) (direction), [ADR-0040](../decisions/0040-present-the-investigation-as-floating-islands-over-a-full-bleed-map.md) (islands), [ADR-0042](../decisions/0042-compute-the-color-system-for-dark-and-light-themes.md) (color system), [ADR-0044](../decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md) (components). This is a selected direction, not a user-tested preference.

## Direction: mineral relief, field precision

The subject supplies the identity: a high mountain valley read through cartography and field science. The relief map is the stage; the work product (findings, hypotheses, the plan) carries the strongest type and contrast. Boldness is spent in one place, the living map with evidence composing over it. Everything else is quiet, opaque and exact.

Principles [D]:

1. The place is always on screen. The relief map is full-bleed, a few islands float over it, and text panels are opaque.
2. Color belongs to the land and the data. Interface chrome is quiet and consistent, data palettes are used only for data, and status always pairs an icon with words.
3. Every statement shows its claim kind (observation, published context, hypothesis, model estimate, scenario, field requirement, verified outcome) as a glyph and words.
4. Missing data is drawn. Hatching, dashed outlines and plain sentences mark where data is absent, and zero is shown as a value, never as a gap.
5. Oblique views and 3D relief are for orientation. Data is read from directly above with terrain off.
6. Each state has a visual budget ([UX architecture](ux-architecture.md#visual-budget)); a new element must replace or collapse another.

## Themes

Dark is the default for the map workspace: data colors and relief read best on a dark ground, and the map dominates the screen. Light is a full theme, not an inversion: each theme's scales are computed against its own backgrounds and its data palettes are validated over its own map ground. Light serves exports and print, bright rooms and people who read light interfaces more easily. The decision brief export is always light.

## Color

### Method

Six hues, each a 12-step scale computed in OKLCH ([color system research](../../research/design/color-system.md)):

| Steps | Job | Rule |
|---|---|---|
| 1 to 5 | Backgrounds: app, subtle, component, hover, pressed | Fixed lightness per theme |
| 6 | Separators | APCA Lc at least 15 on every persistent background |
| 7 | Container borders | Lightness midpoint of steps 6 and 8 |
| 8 | Control boundaries, focus | WCAG at least 3:1 on every persistent background |
| 9, 10 | Solid fills and their hover | At the contrast threshold of their foreground |
| 11 | Text, colored text | WCAG at least 4.5:1 and Lc at least 60 on every persistent background (neutral 11: at least 7:1 and Lc 75) |
| 12 | Strong text | Lc at least 90 |

Hues: neutral and accent 215 (a cool slate and a teal-cyan accent), success 150, warning 69, danger 28, info 250. The accent hue was chosen as the hue in the earlier teal-gray range farthest from every data color: at 215 it sits 6.4 OKLab units from the nearest data color, where the earlier hue sat 3.4 from the strongest greener vegetation class. WCAG 2.2 ratios are the normative check; APCA Lc is advisory. Roles alias scale steps, so components never use a raw step.

### Roles (selected)

Contrast is WCAG ratio on the default surface (dark `bg.surface` #1F282A, light `bg.surface` #FAFDFE), from the [contrast report](../../design/tokens/contrast-report.json).

| Role | Dark | Light | Use |
|---|---|---|---|
| `bg.canvas` | #101719 | #F2F6F7 | App ground, map margin |
| `bg.surface` | #1F282A | #FAFDFE | Islands and panels |
| `bg.overlay` | #273033 | #FAFDFE | Popovers, menus, inspector |
| `bg.selected` | #203236 | #E1F2F6 | Selected rows and items |
| `text.primary` | #EBF0F1 (13.09:1) | #141C1D (16.93:1) | Content |
| `text.secondary` | #D2D8DA (10.45:1) | #424D50 (8.53:1) | Labels, secondary content |
| `text.tertiary` | #B7BFC2 (8.06:1) | #5F6A6E (5.45:1) | Method lines, metadata, units |
| `text.link` | #7BCADD (8.12:1) | #1B7183 (5.50:1) | Links (underlined) |
| `border.subtle` | #5A666A | #C2CACD | Separators only, never the sole boundary of a control |
| `border.control` | #778386 (3.85:1) | #7B868A (3.66:1) | Boundaries that identify controls |
| `border.focus`, `interactive.default` | #63BCD0 (6.91:1) | #208195 (4.43:1) | Focus ring, selection edge, primary action fill |
| `text.on-accent` | #101719 on accent (8.32:1) | #FFFFFF on accent (4.53:1) | Text on the primary action |
| `status.*.fg` | about 8.1:1 each | about 5.5:1 each | Danger, warning, success, info text, always with an icon |

Rules: one interactive accent; status colors never decorate and never appear on the map; completed work stays neutral with a check, not green; color is reserved for what needs attention; green belongs to vegetation data, so no green interface accent exists. Text panels are opaque: text holds its contrast over the worst map pixels only from 91 to 92% opacity, and the map stays visibly see-through until 97 to 98%. Small control islands and menus over the map may use `bg.surface` at 94% or more with backdrop blur and an opaque fallback (no `backdrop-filter` support, or `prefers-reduced-transparency`); whether this helps users is untested. Dark text tiers sit close in lightness, so hierarchy comes from size and weight as well as color. Disabled controls state the reason in words; opacity alone never signals state.

## Data palettes

Separate from brand and status colors, one set per theme, built in OKLCH with lightness monotone per arm, checked with a color-vision-deficiency simulation (Machado 2009) and over each theme's map ground. Data rasters draw at opacity 0.9 over the relief (the computed minimum for class order to survive hillshade is 0.83).

| Palette | Job | Dark (low to high) | Notes |
|---|---|---|---|
| `data.ndvi` | Raw NDVI (dimensionless), 7 classes | #3E3504 to #BEDEC3 | Low values recede into the dark map; the light theme uses the published cmocean speed ramp (MIT license; ship its notice); fixed domain stated in the legend; never rescaled per period |
| `data.ndvi-departure` | Departure from the same-month reference | #F2A85F, #B27D3B, #745426, #2D3132 (reference), #266854, #379D7F, #57D4AE | Warm arm means less green than the reference, nothing more; legend, values and table are mandatory |
| `data.rain-departure` | Departure from the 1991 to 2020 mean (mm) | Same warm arm, #2D3132, #345F82, #588DC7, #92BCFC | Drier is warm, wetter is blue |
| `data.categorical` | Sampling strata and series identity | Three hued slots in fixed order (#CB5A1A, #8B57BE, #20AB9E in dark) plus a neutral `other` that is always dashed or patterned | No four-color set passed every check in the dark theme; never for values |
| `data.no-observation-hatch` | Missing or below coverage policy | 45 degree hatch, 1 px, 6 px spacing | Never a value color |
| `data.excluded-hatch` | Deliberately masked stratum (for example irrigated cropland) | 135 degree hatch | The legend states the reason |

Chart rules: one y-axis per panel, never dual axes; vegetation and rainfall in aligned separate panels; 2 px lines, 8 px markers, hairline grid; no line across gaps; fixed domains; direct label only the selected value; every chart has a table view. Never paint a red "overgrazed" class from NDVI.

## Typography

**IBM Plex** [D]: Plex Sans for interface and content, Plex Sans Condensed for map labels and dense tables, Plex Mono only for record identifiers. Measured values use Plex Sans with tabular figures. Plex Sans Arabic and Noto Sans Tifinagh are in the font stack for later locales ([accessibility and language](accessibility-and-language.md#the-translation-layer)). All are SIL OFL 1.1; ship the license with self-hosted files.

| Token | Size and line | Weight | Use |
|---|---|---|---|
| `type.display` | 28/34 | 500 | Arrival case title only |
| `type.title` | 22/28 | 500 | Answer finding, inspector title |
| `type.value` | 22/28, tabular | 500 | One headline value with its unit |
| `type.heading` | 16/22 | 500 | Section and card headings |
| `type.body` | 14/20 | 400 | Body text, inputs, table cells |
| `type.label` | 12/16 | 500 | Labels, legends, status words |
| `type.small` | 12/16, tabular | 400 | Method lines, metadata, captions |
| `type.identifier` | 12/16 mono | 400 | Record IDs, period IDs, hashes |
| `type.map-label` | 12/16 condensed | 500 | Map labels with a halo |

Nothing essential below 12 px; only map attribution may be 11 px. Sentence case everywhere; no all-caps eyebrows; no middle-dot metadata strings (use labeled fields). Precision follows method uncertainty: NDVI to two decimals, rainfall to whole millimeters, areas to one decimal km². Months as "Apr 2022" on screen and "April 2022" in screen-reader text, full dates as "26 Oct 2026", ISO in identifiers ([voice and tone](voice-and-tone.md#dates-and-times)). Wording: [voice and tone](voice-and-tone.md).

## Geometry and surfaces

| Token family | Values |
|---|---|
| Spacing | 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px |
| Radius | island 12, card 10, control 8, chip 6, pill 999 |
| Borders | 1 px hairline; focus ring 2 px with 2 px offset |
| Elevation | Shadows only on islands over the map (`shadow.island`) and on popovers (`shadow.popover`); nested containers separate by a surface step, not a border or shadow |
| Layout | Island inset 16; case pill 40 tall; ornament buttons 36 with 44 hit areas; sheet 480, 440 or 400 by viewport; stack below 960; timeline 40 collapsed, 96 expanded; legend 280; case card 440 |

No outer borders on non-interactive containers; spacing separates rows. One radius per level of hierarchy, not one radius everywhere.

| State | Treatment |
|---|---|
| Selected | `bg.selected` plus a 2 px accent edge and its label |
| Keyboard focus | 2 px `border.focus` ring with 2 px offset; on the map a two-tone ring (`focus.map-inner` and `focus.map-outer`) |
| Running | Accent dot with the real task label; static under reduced motion |
| Needs attention | Warning icon plus words |
| Failed | Danger icon plus the cause and Retry |
| Stale | Dashed outline plus "Inputs changed. Run again" |
| Missing data | Dashed outline, hatch and a sentence |
| Disabled | Reason in words; never opacity alone |
| Loading | Pending slot with the real task label; no skeleton shimmer, no percentages |

Icons: Lucide (ISC license), 16 or 20 px, with a visible label for unfamiliar actions. Claim-kind glyphs: observation (scan), published context (book-open), hypothesis (circle-help), model estimate (sigma), scenario (git-branch), field requirement (clipboard-list), verified outcome (badge-check). No avatars, mascots or decorative agent graphics.

## Cartography

| Element | Treatment |
|---|---|
| Relief | Hillshade from the DEM in the theme's `map.hillshade-*` colors, multidirectional where supported; no hypsometric rainbow and never green elevation tints, which readers mistake for vegetation (VIS-19) |
| Contours | `map.contour` and `map.contour-index`; labels only in P1 |
| Area outline | `map.outline` (mineral) with `map.outline-casing`; role label always attached ("Valley catchment, not a pasture, agdal or management boundary"); outside the area, context dims with `map.context-dim` |
| Data raster | One at a time at `data.opacity`; legend states metric, period, reference, domain and coverage; terrain off and pitch 0 while data shows |
| Rainfall grid | Cell strokes in `map.grid-stroke`, cased in the dark theme, so every cell edge reads over every class |
| Labels | `type.map-label` in `map.label` with `map.label-halo`; sparse; never over the selected area's data |
| Strata | Thin outlines with pattern or categorical fills, never value colors |
| 3D horizon | `map.sky`, `map.horizon` and `map.fog` so distant relief fades into the app ground |
| Attribution | Always visible at the bottom right of the visible map region |

## Motion

Durations 120, 220, 280 and 360 ms; camera 900 ms; long camera moves up to 2400 ms; arrival 2800 ms; standard easing `cubic-bezier(0.22, 1, 0.36, 1)`. One focal transition at a time; data never animates. Full contract: [motion](motion.md); scenes: [scenes and views](scenes.md).

## Brand boundary

Name, tagline and case descriptors live in one brand configuration; no product name in schema names, IDs or database keys. Working tagline: "Environmental intelligence, put to work." The product never presents itself as a staffed or certified consultancy and uses no seals or badges implying certification.
