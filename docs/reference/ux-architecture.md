# UX architecture

The workspace anatomy, the AI composition contract and the shared context that keep chat, map, timeline and panels in one state. Decisions: ADR-0006 (guided workspace), ADR-0007 (catalog-constrained composition) and ADR-0040 (floating islands). Scenes: [experience storyboard](experience-storyboard.md); components: [components](components.md); motion: [motion](motion.md); map scenes: [scenes and views](scenes.md). Pattern evidence: [UI patterns research](../../research/design/ui-patterns.md).

## Anatomy

The map is always full-bleed and never resized during a transition. Everything else floats above it as a few islands with 16 px insets; islands change the camera `padding` so the area stays centered in the visible map.

```
1440 x 900, working state
+------------------------------------------------------------------------------+
| (case pill: mark, case title, status word, mode)        (views | 3D | zoom)   |
|                                                                              |
|                                                   +-------------------------+|
|                                                   | INVESTIGATION SHEET 480 ||
|              full-bleed relief map                |  Place          summary ||
|              area outline, one data layer         |  Observations  expanded ||
|                                                   |  Explanations   summary ||
|                                                   |  Responses      summary ||
| (legend, only with a data layer)                  |  Next steps     summary ||
|                                                   |-------------------------||
| (timeline scrubber 40, expands to 96 on focus)    |  director (composer)    ||
+---------------------------------------------------+-------------------------++
```

| Island | Position | Content | Shows when |
|---|---|---|---|
| Case pill | Top left, 40 px | Mark, case title, status word, mode label; menu with Activity, History, revision | Always |
| Map ornament | Top right | Views menu ([scenes](scenes.md); its Overview item also resets the camera), 3D toggle, zoom (44 px hit areas) | Always |
| Investigation sheet | Right, 480 px, opaque, 12 px radius | The five sections; only the focused one expanded, the rest one line each | After commissioning |
| Director | Attached to the sheet's bottom edge | Composer input; context chips on focus; receipt and live step line | After commissioning (arrival uses the case card) |
| Timeline | Bottom of the map region | 40 px scrubber with coverage; expands to the three-row strip on focus, and automatically when Observations or Explanations open at viewports 1360 px and wider | While the map shows a period-dependent layer; hidden under the review and history overlays |
| Legend | Bottom left | Metric and period, ramp with domain ticks, coverage, method line, details | Only while a data layer shows |
| Inspector | Over the sheet, same width; wide content as an overlay `min(760px, 54vw)` wide | Evidence, source, measurement detail; intervention comparison and full brief | On demand |
| Trace | Bottom sheet over the map, 45% height | Task tree and timing ([components](components.md)) | On demand |

Arrival shows only the case card (bottom left), the case pill and the map ornament. Focus mode (one button and one shortcut) hides the sheet and timeline so the map fills the frame. The approved hero (design language 1.3) arrives differently: names on the land, the command line holding the case question, the key hints and the credit line, with no card until the work starts ([scenes](scenes.md#valley-sequence), [components](components.md#hero-components-design-language-13)).

| Viewport | Sheet | Timeline | Inspector | Trace |
|---|---|---|---|---|
| 1440 x 900 | 480 px | Across the map region | Over the sheet | Bottom sheet |
| 1280 x 800 | 440 px | Across the map region | Over the sheet | Bottom sheet |
| 1024 x 768 | 400 px; legend collapses to a button | Collapsed by default | Over the sheet | Full height over the map |
| Below 960 px | Bottom sheet over a full-width map | Under the map | Modal sheet | Modal sheet |

Text panels are opaque. Small control islands (pill, ornament) and menus over the map may use `bg.surface` at 94% or more with blur and an opaque fallback ([design system](design-system.md#color)); never glass under paragraphs.

## Visual budget

Each state has limits that QA counts automatically (acceptance criteria). Attribution does not count.

| State | Islands | Controls | Expanded components | Text items | Unobstructed map |
|---|---|---|---|---|---|
| Arrival | 3 | 8 | 1 | 25 | at least 75% |
| Working | 4 | 12 | 1 | 30 | at least 60% |
| Reading | 5 | 19 | 2 | 40 | at least 55% |
| Review | 4 plus the inspector | 15 | 1 | 40 | at least 45% |
| Focus mode | 2 (3 with the legend while a data layer shows) | 8 | 0 | 12 | at least 90% |

Budgets apply to resting states. Transient and deliberately expanded states have their own limits:

| State | Islands | Controls | Text items | Unobstructed map |
|---|---|---|---|---|
| Tour playing (transport bar) | Resting state plus the transport bar | Resting state plus at most 6 | Resting state plus at most 3 | at least 55% |
| Trace open (bottom sheet, 45% height) | 4 plus the trace | 26 | 80 | at least 35% |
| Menu or popover open | Resting state plus one overlay | Resting state plus the overlay's items | Resting state plus the overlay's items | The resting state's minimum minus 10 points (65% at arrival) |
| Evidence matrix expanded (ledger level 2) | Reading | Reading | 70 | Reading |
| Below 960 px (bottom sheet) | Bottom sheet, case pill, ornament, the timeline under the map and the collapsed legend button (5) | 18 | 40 | at least 35%; modal sheets (review, inspector, trace, export) are exempt |

States: **Working** means tasks are running and no data layer is on the map; **Reading** means a section with findings or a data layer is expanded; **Review** means the review queue, the inspector or a wide overlay is open. Counting rules: an element counts only when visible (hit-tested, not scrolled out or covered); labels inside graphics (chart text, timeline ticks, legend ticks) are not text items; expanded components are catalog components, and the answer card counts as its section's header, not as a component. At all times: at most one popover, one toast, one mode label, one honesty tag per graphic, one interactive accent, and one focal transition. Rationale: working memory holds about four chunks (Cowan 2001), and progressive disclosure works best in two levels.

### The hero's budget (design language 1.3)

In the hero sequence the budget counts the hero's parts instead of islands; the tables above apply to the investigation workspace. Credits, key hints and focus notes are not counted as words.

| Per screen | Limit | In the approved frames |
|---|---|---|
| Cards and leaders | 1 card, joined to its place by 1 leader | 1 card from the work beat on, with at most 1 leader; none at arrival |
| Words on the card | at most 45 | 37 to 45 in the approved stills |
| Labels on the land | at most 5; a two-line block (a place name with its region line, or a measured label with its honesty line) counts as one | 0 to 5 |
| Words in a land label line | at most 6; an honesty line (marked so in the string catalog) is exempt | at most 6; the catchment's honesty line has 7 |
| Actions | 1 key hint for the beat's action, plus "F Read flat" in every beat | 1 plus 1 |
| Selected places | 1 | 1 |
| Measured layers on the land | 1 painted layer, plus at most 1 more as outlines only | The vegetation departure with the rain cells' outlines (work); the rain cells painted, with their outlines (challenge) |
| Mode labels | 1 (the mode line) | 1 |

The arrival's one primary action is the key hint "↵ Start investigation"; "F Read flat" is a view control, not a second primary action. Strings, kinds and per-beat counts: [microcopy](microcopy.md), section 1a.

### The instruments' budget

The instrument views (the layer stack, the cutaway, the pixel anatomy) have their own visual budget distinct from the hero's: each instrument's reference specification defines its element ceilings. Credits are not counted. The layer stack (five layers over relief):

| Per screen | Ceiling |
|---|---|
| Large figures | 1, with its unit line and one grey qualifying line carrying its source chip |
| Sheets | 5, stacked straight up over the relief model, one dataset each |
| Leaders | 5, one hairline from each sheet's plate to its label; only the selected sheet's leader and number are warm |
| Sheet labels | 5: number, swatch, name and source chip; one question line; one key line |
| Notes on the model | 1, the vertical scale |
| Warm accent | 1 thing, the selected sheet |
| Command line | 1, from the briefing shell |

The cutaway (cross-section through Tabant):

| Per screen | Ceiling |
|---|---|
| Large figures | 1, with its unit line and one grey qualifying line carrying its source chip |
| Section | 1 face, the catchment cut along the transect bundle's line; the profile along its top is the bundle's |
| Band blocks | 3, against the face at each band's height: name, trend with its unit, 12-month snow strip; one snow key |
| Leaders | 6 hairlines: 3 to the band blocks, 1 stem to each of the two statements, 1 tick to the named place; none warm |
| Statements | 2 published statements, each at most two lines with its source chips, next to what it describes |
| Notes on the model | the ruler's 4 labels, the 2 band limits, N and S, the vertical scale, and 1 place name only where the line passes within 100 m of the case record's point |
| Warm accent | 1 thing, the cut line along the profile |
| Command line | 1, from the briefing shell |

The pixel anatomy (one MODIS pixel opened into its Sentinel-2 cells):

| Per screen | Ceiling |
|---|---|
| Caption | 1 question, one ink sentence and one grey sentence, each with its source chip |
| Panels | 6, numbered: 02 Pixel Cells and 05 Linear Mix Model the largest; 01 Locate and 04 Season Record compact (title, the visual, one line) |
| Large figures | 1, the model's NDVI in 05, with its change from the measured shares |
| Controls | 3 class boundaries on the composition bar (drag, or arrow keys; Home returns to the measured shares) and 1 reset button |
| Labels | the model labelled as a model, not a measurement of plant species; the field check labelled proposed, not measured |
| Connectors | 3 hairlines: two from the locator's ring to the pixel, one from the transect to the field check |
| Warm accent | the selected pixel (its mark and footprint) and the proposed field check, nothing else |
| Command line | 1, from the briefing shell; no content within 24 CSS px of it | The instrument checks (`apps/web/e2e/instrument-*.spec.ts`) count what is drawn against these ceilings, and also check that no line of text overlaps another, none is under 12 CSS px and none leaves the frame.

## Sections and focus

Five fixed sections in reading order: **Place, Observations, Explanations, Responses, Next steps**. The model cannot reorder them; order is part of the argument. The section that receives the result of the user's latest command expands; the others collapse to one line. Background results never collapse what the user opened and never move content under the pointer (rule 5 in [motion](motion.md)).

The map follows the focused section by default; a view the user picks from the Views menu overrides this until their next command, and the legend states the override.

| Focus | Default map |
|---|---|
| Place | Relief, area outline, place labels; oblique views allowed |
| Observations | Vegetation layer for the committed period, top-down, terrain off |
| Explanations | Vegetation layer plus the native rainfall grid |
| Responses | Area outline with excluded strata hatched |
| Next steps | Sampling strata |
| A selected evidence item | Its spatial scope highlighted (linked highlighting) |

## Linked highlighting

Hovering or focusing an evidence chip lights the sentences that cite it, the matching evidence tile and its spatial scope on the map, using MapLibre feature state (brushing and linking). Selecting a hypothesis does the same for its supporting, contradicting and missing evidence. This replaces most drawn connectors.

## AI composition contract

The model proposes layout through `propose_layout`; the server validates the whole proposal against the catalog and the case, and a deterministic reducer applies it inside the commit. Layout records are presentation state reconstructible from case records ([data contracts](data-contracts.md#presentation-contract)). This follows catalog-constrained generative UI practice (A2UI, MCP Apps, json-render): a client-owned catalog, binding by reference, keyed replacement, coded validation issues. It rejects what tldraw's agent kit does (model-written coordinates, screenshots as context, applying partial actions). Evidence: [generative workspace research](../../research/technology/generative-workspace.md).

| Decision | Owner |
|---|---|
| Which catalog components a result needs, which records they bind, comparison mode, title, focus when the user's own command completes | Model proposal, after validation |
| Component existence, section, order, expanded or collapsed, exact entity revisions, presentation status | Server reducer (deterministic) |
| Defaults when no valid proposal exists | Server reducer: default projection by task kind |
| Island layout, sheet width, camera padding, default map layer, pitch, timeline rows | Fixed shell rules in this document, [components](components.md) and [motion](motion.md) |
| When an accepted change appears, focus movement, scrolling, user expand or collapse, user-picked view | Client view state |

| Action | Parameters | Accepted when |
|---|---|---|
| `show_component` | `componentKind`, `entityIds`, `section`, optional `title` (60 characters, plain text) | Kind is in the catalog and allowed in that section; every entity exists at its current revision and matches the kind |
| `update_component` | `componentId`, `entityIds` | Component exists; new revisions are newer; kind unchanged |
| `set_comparison` | `componentId`, `comparisonMode` (`single`, `aligned` or `two_period`), `periodIds` | Component is a temporal comparison; series share area revision and period IDs |
| `focus_entity` | `entityId` | Only in the commit that completes the user's own command |
| `hide_component` | `componentId` | Never hides a component the user is inspecting |

Rejected always: unknown kinds, catalog mismatches, coordinates, sizes, CSS, markup, code, URLs, section reordering, more expanded components than the state's budget, focus changes from background work, titles with numbers not in bound records or with verdict words ("proves", "caused by"). A rejected or missing proposal never fails the task: the reducer applies the default projection for the task kind, and no model repair round is spent on layout.

The model's context for layout is a workspace summary (component IDs, kinds, sections, visibility, bound IDs, status), the command context and the catalog descriptions: never pixels, sizes or screenshots.

Shell states are derived, never proposed: `arrival`, `investigating`, `comparing` (an expanded temporal comparison in aligned or two-period mode), `reviewing` (decision brief with review panels open), `focus` (focus mode).

### Hold and release

Data-only changes apply in place: rows append, nothing reorders under the pointer, changed cells get a brief highlight. Composition changes apply immediately only when they complete the user's latest command and the pointer and keyboard focus are outside the affected section; otherwise they wait behind "View new findings (n)" with one polite announcement. An open inspector also holds them. All records of one commit apply in one state update so map layer, chart and timeline switch together.

Validation, revision binding, missing and error states, text equivalents, hold and release, and reduced motion are mandatory invariants; optional composition embellishments (shared-element chip travel, two-period mode, model-proposed titles, `hide_component` and animated composition) degrade gracefully to the deterministic default projection when omitted.

## Shared context

Chat, map and panels share one context object, shown as director chips when the composer has focus:

| Chip | Value | Changed by |
|---|---|---|
| Area | Active geo selection label and role | Area card, map selection of a stratum |
| Period | Committed period or range | Timeline, chart click |
| Focus | Selected record or component | Selecting any record |

A command carries `caseId`, `expectedCaseRevision`, the context above with revisions, the text and an idempotency key. Changing the selection while a command runs does not retarget it; results are labeled with the context they were computed for.

## Temporal selection

The committed period is one state value in the URL. Dragging previews the label only; committing loads the matching map asset and moves chart cursors in one state transition. Stale responses are dropped by request token. Gaps are visible and not selectable as observations; missing imagery is never interpolated. The timeline's Play button runs the `period_timelapse` scene ([scenes](scenes.md)), so map, chart cursor and legend move together. Keyboard: arrows by month, Shift with arrows by year, Home and End.

## Semantic connectors

Linked highlighting is the default. Drawn connectors render only for the selected record when the sheet and map sit side by side, at most six, labeled ([data contracts](data-contracts.md#semantic-relationships)); drawing order puts contradicting and authorization edges first, and overflow is listed, never silently omitted. The text list of relations in the selected record's details is the semantic representation in every phase. Implementation: one SVG overlay (`pointer-events: none`, `aria-hidden`) fed by an anchor registry of elements carrying `data-entity-id`, measured with `getBoundingClientRect` and `ResizeObserver`, map endpoints projected with `map.project`; hidden during layout animations (P1).

## Navigation and focus

Sections are `h2` regions in a `main` landmark; the map is a labeled supplementary region whose every fact is also in the sheet. Command completion may move focus to the new section heading; background results announce politely without moving focus. Escape closes the inspector and returns focus to its invoker. The URL holds case, period, focus, view and open inspector, so reload and back restore the view. Read-only historical revisions carry a persistent banner and "Return to current case".
