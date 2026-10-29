# Design system

The visual rules for Siterra: color, data palettes, type, geometry, states, icons, cartography and motion. Version 1.3, 27 Oct 2026: the hero the founder approved, in daylight. Tokens: [siterra.tokens.json](../../design/tokens/siterra.tokens.json) (DTCG 2025.10, ADR-0029); generated stylesheet: [siterra.css](../../design/tokens/siterra.css); computed contrast: [contrast-report.json](../../design/tokens/contrast-report.json). Color method and evidence: [color system research](../../research/design/color-system.md). Decisions: ADR-0009 (direction), ADR-0040 (islands), ADR-0042 (color system), ADR-0044 (components). The hero sequence itself: [scenes](scenes.md#the-hero-sequence-design-language-13), [motion](motion.md#the-hero-timeline-design-language-13), [components](components.md#hero-components-design-language-13), [microcopy](microcopy.md). This is a selected direction, approved by the founder, not a user-tested preference.

## Direction: a lit instrument over real land

The subject supplies the identity: a high mountain valley read through cartography and field science. The terrain runs to every edge of the frame and past the study area into haze, so there is never a block and never a void. The catchment is the selected district because one low warm light falls on it, and it is marked the way a surveyor marks land, with one drawn line. What belongs to a place is written at that place: names on the ground, measurements painted at their true resolution, located evidence on a thin stem over its exact point, gaps left bare with their reason written where they are. What has to be read sits on one card that keeps its place and reaches the land by one leader. It says one thing at a time in a two-tone sentence (the claim in ink, its limit in grey), then its source and period, and a Meaning line that says what the number does not prove. Certainty is drawn, not coloured. Motion follows the order of the work, at the data's true cell size; the camera moves only between steps and holds still while you read.

Principles [D]:

1. Land to every edge and into haze; never a block on a plain ground. Surrounding names, graticule ticks and a north mark keep the world continuous; a scale bar only in the flat view, because an oblique view has no single scale; the vertical exaggeration is written beside the view.
2. One matte material for all terrain. Selection is light, not paint: the catchment sits in a warm light pool and the land outside takes paper haze.
3. One warm accent, used as light and as thin line only, never as a filled area: the outlet beam, the selected stem, the running step's mark, the season on show, the playhead, the case ring and the command line's caret. Leaders and focus rings are ink.
4. Certainty is drawn: solid line or fill for measured; dashed for proposed or expected; an open ring without a stem for reported in a source with no mapped location; the no-observation hatch with a written reason for a gap; the status word inside the sentence. Colour never carries certainty alone. No traffic-light dots.
5. One card per screen in a stable place, as tall as its content, joined to its place by one leader. Budget per screen: the card holds at most 45 words, and the land at most 5 labels. A land label line has at most 6 words; an honesty line (marked so in the string catalog, [microcopy](microcopy.md) section 1a) is exempt from the word cap; a two-line block (a place name with its region line, or a measured label with its honesty line) counts as one of the 5 labels. What does not fit waits for focus or the next step, never smaller type, and honesty lines are never cut.
6. Measured layers are painted on the land at their true cell size and shown in the oblique views of the story, with the exaggeration written beside the view; areas and patterns are read in the flat view ("Read flat": top-down, north up, terrain off).
7. Every number has its source and period beside it, at its method's precision (whole mm, NDVI to two decimals, areas to one decimal km²), from stored values only. Every result carries "Simulated answer." until the hypothesis task runs.
8. Key hints instead of buttons; one command line; a question never becomes a chat bubble, it becomes the first line of the card and the land answers.
9. In the investigation workspace every statement shows its claim kind (observation, published context, hypothesis, model estimate, scenario, field requirement, verified outcome) as a glyph and words.

## Themes

Light is the default since version 1.3: the founder approved the hero in daylight (paper ground, the real land in one low warm light, cool shadows) on 27 Oct 2026. Daylight reads as a place, not a tactical map; the season stems read at a glance on paper; the two-tone verdict in the paper sky reads like the opening page, so the product ends the way it begins; and footage from the valley cuts into it without a jump in light. Dark stays a complete computed theme in the tokens but is not the default, and the approved hero does not use it. Each theme's scales are computed against its own backgrounds and its data palettes are validated over its own map ground. The decision brief export is always light. ADR-0042 recorded dark as the default; that default is superseded by version 1.3.

## Color

### The daylight palette

The hero's named colours, `palette.light.daylight`; every light role that the hero shows points at one of them.

| Token | Hex | Use |
|---|---|---|
| `paper` | #F2EFEA | Page, sky, haze and the land's fade; the ground of the opening and the globe |
| `card` | #FDFDFC | Cards, sheets and dialogs over the land |
| `ink` | #2B2925 | Claims, primary text, names on the land, the catchment line, leaders |
| `grey` | #6B6762 | The grey half of a two-tone statement, source lines, captions |
| `shadow-tint` | #788693 | The relief's lee slopes; the elevation-band tints; the near-normal slab |
| `accent` | #B5561F | Light and line only (principle 3) |
| `land-albedo` | #DCD4C9 | The land without imagery, lit by the key light |
| `key-light` | #FFF4E6 | The one low warm light, from the front left of the arrival view |

### Method

Six hues, each a 12-step scale computed in OKLCH ([color system research](../../research/design/color-system.md)):

| Steps | Job | Rule |
|---|---|---|
| 1 to 5 | Backgrounds: app, subtle, component, hover, pressed | Fixed lightness per theme |
| 6 | Separators | APCA Lc at least 15 on every persistent background |
| 7 | Container borders | Lightness midpoint of steps 6 and 8 |
| 8 | Control boundaries, focus | WCAG at least 3:1 on every persistent background |
| 9, 10 | Solid fills and their hover | At the contrast threshold of their foreground |
| 11 | Text, colored text | WCAG at least 4.5:1 and Lc at least 60 on every persistent background |
| 12 | Strong text | Lc at least 90 |

The light neutrals are warm. In the light theme the accent scale sits in the hero accent's hue (OKLCH 0.5625, 0.1395, 46.7, step 9 the accent itself); the dark theme keeps its computed teal accent. Success 150, warning 69, danger 28 and info 250 are unchanged. WCAG 2.2 ratios are the normative check; APCA Lc is advisory. Roles alias scale steps or the daylight colours, so components never use a raw value.

### Roles (selected)

Light ratios are WCAG on the card (`bg.surface` #FDFDFC) and on paper (`bg.canvas` #F2EFEA); dark ratios on dark `bg.surface` #1F282A. Every value is in the [contrast report](../../design/tokens/contrast-report.json).

| Role | Light (default) | Dark | Use |
|---|---|---|---|
| `bg.canvas` | #F2EFEA (paper) | #101719 | Page, sky, the map's margin |
| `bg.surface`, `bg.overlay` | #FDFDFC (card) | #1F282A, #273033 | Cards, popovers, dialogs |
| `bg.selected` | #E8E7E5 | #203236 | Selected rows and items, with a 3 px accent line |
| `text.primary` | #2B2925 ink (14.26:1, 12.66:1 on paper) | #EBF0F1 (13.09:1) | Claims, content |
| `text.secondary` | #6B6762 grey (5.51:1, 4.89:1) | #D2D8DA (10.45:1) | The grey half of a statement, labels, sources |
| `text.tertiary` | #6A6764 (5.52:1, 4.90:1) | #B7BFC2 (8.06:1) | Method lines, metadata, units |
| `text.link` | #2B2925, underlined (14.26:1) | #7BCADD (8.12:1) | Links, always underlined |
| `border.subtle` | ink at 16% | #5A666A | Rules between rows; never the sole boundary of a control |
| `border.control` | #878481 (3.65:1, 3.24:1) | #778386 (3.85:1) | Boundaries that identify controls |
| `border.focus`, `focus.ring` | #2B2925 ink (14.26:1, 12.66:1) | #63BCD0 (6.91:1) | Focus ring, 2 px with a 2 px offset (4 px on the key slot) |
| `interactive.default` | #2B2925 ink | #63BCD0 | Key hints and the primary action, drawn in ink |
| `status.*.fg` | about 5.5:1 each | about 8.1:1 each | Danger, warning, success, info text, always with an icon |

Rules: one warm accent, as light and line only, never a fill; key hints and actions are drawn in ink; status colors never decorate and never appear on the map; completed work stays neutral with a check, not green; green belongs to vegetation data, so no green interface accent exists. Text panels are opaque: the hero's cards are #FDFDFC with the island shadow. Disabled controls state the reason in words; opacity alone never signals state.

## Data palettes

Separate from brand and status colors, one set per theme, built in OKLCH with lightness monotone per arm, checked with a color-vision-deficiency simulation (Machado 2009) and over each theme's map ground. Values below are the light theme, which the hero draws.

| Palette | Job | Light (low to high) | Notes |
|---|---|---|---|
| `data.ndvi-departure` | April NDVI departure from the other Aprils | #A26112, #C79150, #E7C293, #F8F6F4 (reference), #97D9C1, #4EB293, #16866A | Fixed scale of plus or minus 0.10 NDVI, never rescaled per period. Within 0.005 of zero the land is left unpainted, so a departure of 0.01 looks as small as it is. Beyond it, t = (\|d\| - 0.005) / 0.095 picks the colour along the three steps of its arm and an opacity of 0.10 + 0.70 t. Painted at 10 m. Warm means less green than the other Aprils, nothing more; the key says what it compares with |
| `data.rain-total` | Wet-season rainfall per CHIRPS cell (mm) | #A0CFF7 (under 400), #6BA1DC (400 to 550), #4273BB (550 and over) | Three display classes, painted flat at true cell size; the key says "Display classes only, not the 1991 to 2020 thirds." A sequential ramp, never the departure ramp |
| `data.rain-departure` | Departure from the 1991 to 2020 mean (mm) | Drier: #A26112, #C79150, #E7C293 (the warm arm of `data.ndvi-departure`); #F8F6F4 (reference); wetter: #D8B9FC, #B481EA, #8D4DC8 | Not drawn in the hero. The wetter arm is violet (OKLCH hue 305), so no colour means both a rainfall total (`data.rain-total`, blue) and a departure |
| `data.band` | The three elevation bands (sampling strata, not pasture units) | The shadow tint at 8, 30 and 55% | Clearly separate steps, no border weight; the band limits as thin contour lines (`data.band.limit`, ink at 70%, 1.5 px), each band named on the ground with its range |
| `data.season` | The season stems | Reference seasons ink at 60%; the season before in ink; the season on show in the accent; the near-normal slab in the shadow tint at 16% | The one 3D object in the dry-year challenge ([components](components.md#season-stems)) |
| `data.ndvi` | Raw NDVI (dimensionless), 7 classes | The published cmocean speed ramp (MIT license; ship its notice) | Fixed domain stated in the legend; never rescaled per period |
| `data.categorical` | Series identity | Three hued slots in fixed order plus a neutral `other` that is always dashed or patterned | Never for values |
| `data.no-observation-hatch` | Missing or below coverage policy | 45 degree hatch | With its reason written where it is; never a value color |
| `data.excluded-hatch` | Deliberately masked land (for example mapped cropland and buildings) | 135 degree hatch | The label states the reason |

Chart rules: one y-axis per panel, never dual axes; vegetation and rainfall in aligned separate panels; no line across gaps; fixed domains; direct label only the selected value; every chart has a table view. Never paint a red "overgrazed" class from NDVI.

## Typography

**IBM Plex** [D]: Plex Sans for interface and content, Plex Sans Condensed for dense tables, Plex Mono for sources, periods, credits and record identifiers. Measured values use Plex Sans with tabular figures. Plex Sans Arabic and Noto Sans Tifinagh are in the font stack for later locales ([accessibility and language](accessibility-and-language.md#the-translation-layer)). All are SIL OFL 1.1; ship the license with self-hosted files.

The hero's type (CSS px on the 1440-wide layout):

| Use | Size and line | Weight |
|---|---|---|
| Opening beat | 48/52, centred, about 38 characters a line | 400 |
| Verdict statement in the sky | 48/54 | 400 |
| Card statement | 22/30, two tones | 400 |
| Card text, question, Meaning line, work rows | 15/22 | 400 |
| Figure on a card | 44/50, unit 22 | 300 |
| Status ("Simulated answer."), sources and periods, source tags | Mono 12/16 (opening tags 14/20) | 400 |
| Names on the land | Plex Sans Medium with light tracking on a thin paper halo; the valley name the largest | 500 |
| Labels on stems, the range name | 13/16 and 12, tracking 0.02em and 0.1em | 500 |
| Sheet labels | 15/20, the number in mono 12 | 500 |
| Key hint labels; the glyph in its box | 15/20; mono 12 | 400 |
| Command line; its "/" glyph | 17/24; mono 15/20 | 400 |
| Verdict status in the sky | Mono 13/18 | 400 |
| Focus notes | 13/18 on the card, 12/17 on the key slot | 400 |
| Stem, slab and gap labels on the land; key slot; mode line; instruments | Mono 11/16 or 11/14 | 400 |
| Graticule ticks (flat reading only) | Mono 11/14 | 400 |
| Credit line | Mono 10/14 | 400 |

Each style above, and the opening and globe's one-case line and the dive's names (Medium 13/18), has a `type.hero-*` token in [siterra.tokens.json](../../design/tokens/siterra.tokens.json). Key hints and the Sources and notices dialog take the valley's form everywhere, the opening and the globe included. With the workspace scale the type sizes are 10, 11, 12, 13, 14, 15, 16, 17, 22, 28, 44 and 48 px.

The product's token scale for the investigation workspace:

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

Nothing essential below 11 px: the hero's smallest text is IBM Plex Mono at 11 px (labels on the land, the key slot, the mode line, the instruments), and only attribution is smaller (the credit line, 10 px). The workspace scale keeps 12 px as its floor. Sentence case everywhere; no all-caps eyebrows; no middle-dot metadata strings (use labeled fields). Precision follows method uncertainty: NDVI to two decimals, rainfall to whole millimeters, areas to one decimal km². Months as "Apr 2022" on screen and "April 2022" in screen-reader text, full dates as "26 Oct 2026", ISO in identifiers ([voice and tone](voice-and-tone.md#dates-and-times)). Wording: [voice and tone](voice-and-tone.md).

## Geometry and surfaces

| Token family | Values |
|---|---|
| Spacing | 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px |
| Radius | island 12, card 0 (the hero's card is square), control 8, chip 6, key glyph 3 (`radius.key`), pill 999 |
| Borders | 1 px hairline; focus ring 2 px ink with a 2 px offset (4 px on the key slot) |
| Elevation | Shadows in ink only on cards and islands over the land (`shadow.island`: 0 1 2 at 8%, 0 8 28 at 10%), on focus notes and popovers (`shadow.popover`: 0 1 2 at 8%, 0 6 18 at 10%) and on dialogs (`shadow.dialog`: 0 1 2 at 8%, 0 12 40 at 18%); nested containers separate by a rule, not a shadow |
| Layout | The hero's card: right 32, top 64, 392 wide. Workspace islands: inset 16; case pill 40 tall; ornament buttons 36 with 44 hit areas; sheet 480, 440 or 400 by viewport; stack below 960; timeline 40 collapsed, 96 expanded; legend 280; case card 440 |

No outer borders on non-interactive containers; spacing and rules separate rows. One radius per level of hierarchy, not one radius everywhere.

| State | Treatment |
|---|---|
| Selected | `bg.selected` plus a 3 px accent line at its left edge and its label |
| Keyboard focus | 2 px `focus.ring` (ink) with a 2 px offset, on every focusable element including card lines; on the map a two-tone ring (`focus.map-inner` and `focus.map-outer`) |
| Running | An accent ring on the running row's mark and the real task label in ink; static under reduced motion |
| Needs attention | Warning icon plus words |
| Failed | Danger icon plus the cause and Retry |
| Stale | Dashed outline plus "Inputs changed. Run again" |
| Missing data | Dashed outline, hatch and a sentence |
| Disabled | Reason in words; never opacity alone |
| Loading | Pending slot with the real task label; no skeleton shimmer, no percentages |

Icons: Lucide (ISC license), 16 or 20 px, with a visible label for unfamiliar actions. Claim-kind glyphs: observation (scan), published context (book-open), hypothesis (circle-help), model estimate (sigma), scenario (git-branch), field requirement (clipboard-list), verified outcome (badge-check). No avatars, mascots or decorative agent graphics.

## Cartography

The land in daylight (tokens `theme.light.map`):

| Element | Treatment |
|---|---|
| Relief | One matte material: the land albedo under the one low warm key light from the front left of the view, lee slopes falling to the shadow tint; relief exaggerated 2.0, written beside the view ("Relief ×2"); no hypsometric rainbow and never green elevation tints, which readers mistake for vegetation (VIS-19) |
| Imagery | The Sentinel-2 summer composite as the land's material, display only: about 60% saturation (70% inside the catchment once the light settles), warmed, lifted 10% toward paper, under the same light; a note says it is a summer view |
| Selection | The catchment in a warm light pool (`map.pool`); outside it the land goes 65% of the way to paper (`map.context-dim`) once the light has settled |
| Haze | To paper with distance from the catchment centre (24 to 52 km), with distance from the eye (70 to 190 km, at 55%) and at the relief block's rim, so the block's edge is never seen |
| Contours | 100 m and 500 m in ink at 4.5% and 9% (`map.contour`, `map.contour-index`), at 30% of that outside the catchment |
| Area outline | `map.outline` (ink at 80%, 1.5 px) on the ridge crest plus 30 m, over `map.outline-casing` (paper at 95%, 4.2 px); labelled "Valley catchment: 417.0 km²" with the honesty line "Not a pasture, agdal, or management boundary." |
| Measured layers | Painted on the relief at their true cell size (rainfall cells, the 10 m vegetation departure), one painted layer at a time, plus at most one more as outlines only (the rain cells' outlines while the vegetation departure is painted, in the work); read as areas or patterns in the flat view |
| Labels | Names on the ground in IBM Plex Sans Medium on a thin paper halo (`map.label`, `map.label-halo`); at most 5 labels on the land, counted as in principle 5 |
| Graticule | 0.1 degree lines in ink at 5% (`map.grid-stroke`) |
| 3D horizon | `map.sky`, `map.horizon` and `map.fog` are paper, so distant relief fades into the page |
| Attribution | One credit line on every frame at the bottom right, with "Sources and notices" |

## Motion

The hero runs on one clock: arrivals ease out with `cubic-bezier(0.2, 0, 0, 1)`; the camera moves only between steps (1.6 s, `cubic-bezier(0.65, 0, 0.35, 1)`) and holds still while anything is read; sentences arrive whole; measured things are revealed in the order of the work. The investigation workspace keeps its durations (120, 220, 280 and 360 ms; camera 900 ms; long camera moves up to 2400 ms) and standard easing `cubic-bezier(0.22, 1, 0.36, 1)`. Full contract: [motion](motion.md); scenes: [scenes and views](scenes.md).

## Brand boundary

Name, tagline and case descriptors live in one brand configuration; no product name in schema names, IDs or database keys. Working tagline: "Environmental intelligence, put to work." The product never presents itself as a staffed or certified consultancy and uses no seals or badges implying certification.
