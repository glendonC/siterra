# Components

The component catalog: what each component is for, what it binds, how it behaves and how it is built. Layout and budgets: [UX architecture](ux-architecture.md). Tokens: [design system](design-system.md). Motion IDs: [motion](motion.md). Records: [data contracts](data-contracts.md). Pattern sources (VIS, UI and library references): [design references](../explanation/design-references.md), [UI patterns research](../../research/design/ui-patterns.md), [component libraries research](../../research/design/component-libraries.md).

## Hero components (design language 1.3)

The parts of the approved hero ([scenes](scenes.md#the-hero-sequence-design-language-13)). Sizes are CSS px on the 1440-wide layout; colours are the light theme's tokens ([design system](design-system.md)), named here by their roles. Strings and their IDs are in [microcopy](microcopy.md), sections 1 and 1a. The workspace components further down predate the hero; inside the hero sequence its parts apply. Where the five sections, the Views menu and the timeline sit in the hero's layout is not decided yet.

### Card

One card per screen, in a stable place, joined to its place on the land by one leader.

- Place and size: the right third on wide screens (right 32, top 64, 392 wide including its padding), as tall as its content, never full height and never a sidebar; a bottom sheet on narrow screens. Padding 22 top, 24 sides, 20 bottom. Square corners. Background `bg.surface` with the island shadow (0 1 2 ink at 8%, 0 8 28 ink at 10%). Rows divided by `border.subtle`.
- One card, one face per beat: when the beat changes, the old face fades out and the new one fades in (300 ms each) while the card's height follows its content. The card slides in 40 px from the right over 400 ms when the work starts.
- Order, top to bottom: the question (15/22, `text.secondary`; a viewer's own question branches from it under a thin grey corner, in `text.primary`); a working line while work runs; the status ("Simulated answer.", mono 12/16, `text.primary`); the two-tone statement (22/30, the claim in `text.primary` and its limit in `text.secondary`); at most one figure (44/50 light, unit 22) or one ruler; source and period (mono 12/16, `text.secondary`); the Meaning line (15/22, `text.primary`); open items as an open ring (9 px, 1 px ink) with their text. The beat's one action is a key hint at the bottom left, not a button on the card.
- Work rows (15/22): the step number in mono 12, the step's text and a status mark, an 8 px ring: grey outline while waiting; accent outline with a soft 3 px accent ring at 15% while running; grey fill when done. The running row's text is `text.primary`, waiting and done rows `text.secondary`. Nothing is filled to mark the running row.
- Chips: mono 12/18 in `text.primary` with a `border.subtle` outline. The Why chip reads "Why", with no colon, and opens the source.
- Focusable lines (the verdict's flags, the field plan's statement) open a focus note under the line on hover or keyboard focus: 13/18 `text.primary` on `bg.surface` with the popover shadow, as wide as the card's text. Keyboard focus on a card line also draws the 2 px focus ring; the note alone does not show focus.

### Leader

One per card, from the card to the place it is about: 1 px `map.leader` (ink at 70%). It leaves the card's left edge 12 px below the top of the line it belongs to, runs 28 px out, then goes straight to the place. On a located thing (the selected stem, the season on show) it ends in a dot of 3 px radius in full ink; when the card is about the whole catchment it ends on the catchment line with a 12 px tick across its end (1.2 px, `map.leader-tick`, ink at 90%). It appears whole, in one frame, once the statement and its source have settled, and never draws on.

### Key hints

Keys instead of buttons. A glyph box (at least 22 by 22, padding 0 5, 1 px `key.glyph-border` (ink at 35%), `radius.key` 3, mono 12, on `bg.surface`) then a label (sans 15/20, `text.primary`), 8 px apart. One row at the bottom left (left 40, bottom 34), hints 24 px apart: the beat's one action first, then "F Read flat". Keyboard focus draws a 2 px ink ring with a 2 px offset. Each beat's action is in [microcopy](microcopy.md), section 1a.

### Command line

One line: a "/" glyph (mono 15/20, `text.secondary`), a thin separator, the input (17/24, `text.primary`, caret in the accent), a `border.subtle` rule beneath; 580 wide, centred, 34 from the bottom. "Ask Siterra" is its placeholder (`text.secondary`) and its accessible name. At arrival it holds the case question; after the arrival it is empty and shows its placeholder. A question the viewer sends turns the accent for 400 ms, leaves the line and becomes a line of the card; it never becomes a chat bubble.

### Key slot

The key of the measured layer on show, at the bottom left above the key hints (left 40, bottom 92): mono 11/14 in `text.secondary`, the layer's title, then its scale's ends or its classes as swatches. Hover or keyboard focus opens its focus note (12/17 `text.primary` on `bg.surface`, 340 wide, popover shadow) and draws a 2 px ink ring with a 4 px offset.

### Sky statement

The verdict is written in the paper sky above the land (left 48, top 58, 800 wide): the status in mono 13/18 `text.primary`, then the two-tone statement at 48/54 with −0.005em tracking, the claim in `text.primary` and its limit in `text.secondary`. The card then carries the figure, its source, method and Meaning line.

### Mode line and instruments

The mode line sits top centre (mono 11/16, `text.secondary`). The instruments sit bottom right (right 40, bottom 38; mono 11/14, `text.secondary`): a north mark that turns with the view, "N" and "Relief ×2" on one row, the imagery note under it.

### Stems and marks on the land

| Part | Drawing |
|---|---|
| Outlet beam | `map.beam` stem 1.6 px up from the outlet with a soft column of the same colour at 22%; at its foot the focus ring (0.32 km: `map.outlet-ring-casing` 3.2 px under `map.outlet-ring-core` 1.2 px) |
| Village stems | `map.stem` 1 px with a ring at the foot; the name in IBM Plex Sans Medium 13/16, tracking 0.02em, `text.primary` |
| Selected evidence stem | `map.stem-selected` 1.8 px with a 1.4 px ring at its foot; its name at the top, where the leader ends |
| Names on the land | IBM Plex Sans Medium with light tracking on a thin paper halo (`map.label-halo`), never a dark outline; the valley name the largest but light; written on the ground in perspective |
| Catchment line | `map.outline` 1.5 px on the ridge crest plus 30 m over `map.outline-casing` 4.2 px, drawn as screen-space lines with round caps |
| Gap | The `data.no-observation-hatch` on the ground with its reason written where it is (mono 11/16 beside a hatch swatch) |

### Season stems

The one 3D object in the dry-year challenge, beside the catchment: one stem per wet season since 1991/92 (`data.season.stem`, 1.3 px), the season before the one on show (`data.season.stem-recent`, 2 px) and the season on show (`data.season.stem-on-show`, 3 px, its label in the accent), each with a dot at its top; the plane at the 1991 to 2020 mean (`data.season.plane`) with the mean line (`data.season.mean`, 1.2 px); the near-normal band as a slab (`data.season.slab` with `data.season.slab-edge`); the zero line (`data.season.base`). Labels in mono 11/16 beside their stem or line.

### Sheets

Measured layers lift as thin sheets cut to the catchment outline (`map.sheet`, the card colour at 38%, with a 1.2 px `map.sheet-edge`, ink at 70%), each labelled at its east edge by the question it answers (IBM Plex Sans Medium 15/20 `text.primary` on a thin paper halo, its number in mono 12 `text.secondary`: "01 Was the season unusually dry?"). They lift 0.7 s apart; when its step runs, a sheet comes down onto the land in 900 ms and gives way to the measurement front. A stack that stays up is not used.

### Opening and globe parts

| Part | Drawing |
|---|---|
| Beat | A centred paragraph in a column of about 38 characters (860 wide), IBM Plex Sans 48/52, the claim in `text.primary` and the qualifier in `text.secondary`; line breaks fixed at the settled tracking |
| Source tag | Mono 14/20 with 0.01em tracking, `text.secondary`, 20 below the beat |
| Mark row | Four marks, 28 by 2, 6 apart, centred at the top: the current one fills in ink as its beat holds, done ones grey, the rest ink at 16% |
| Case mark | A ring in the accent (1.5 px, about 12 px across on screen at any zoom) and a 6 px point in the accent with a 1.5 px paper ring |
| Range name | IBM Plex Sans Medium 12, tracking 0.1em, ink on a 3 px paper halo, set on a smooth curve along the range just north of the case |
| Legend | A swatch of the lit land (`map.biome-swatch` with a 1 px `map.biome-swatch-edge` inside) and "Rangeland biomes, potential extent (Rangelands Atlas method)" in 12/16 grey, on a paper backing |
| Key hints | The valley's form ([Key hints](#key-hints)), here in one row centred at the bottom (bottom 34) on a paper backing. The approved opening and globe frames drew larger ones (28 by 26 glyph boxes, Medium 14/20 labels, the action at Medium 17/24); the build uses the valley's form everywhere, and the same for the Sources and notices dialog |

### Credit line and notices

One credit line on every frame: mono 10/14, `text.secondary`, bottom right (right 40, bottom 14), on a paper halo over the land or a paper backing over the globe, ending in "Sources and notices" (`text.link`, underlined, offset 2) which opens a dialog with every attribution and the Copernicus liability sentences. A credit line changes in one frame, never by a cross-fade.

### Scope

The arrival reaches the scope list (what Siterra will and will not do, [microcopy](microcopy.md#2-scope-popover)) in one interaction: the mode line is that control. Enter or a click on it opens the scope popover; it takes the 2 px ink focus ring, and its accessible name adds "What Siterra will and will not do". The approved frames do not show the popover, and the frame gains nothing else.

## Catalog decisions

- **Islands (always present after commissioning):** case pill, map ornament, investigation sheet, director; timeline and legend when they have content.
- **Composable components (the model may propose them; a reducer places them):** area card, plan and activity, temporal comparison, evidence, hypothesis ledger, livelihood constraints, intervention comparison, field-validation plan, decision brief with review, comparable places (P1).
- **Overlays (user-invoked):** inspector, trace, case history, Views transport bar.
- **Merged on purpose:** firm activity lives in the case pill and plan (no activity feed); resource needs live inside interventions and the field plan; review lives inside the decision brief; source and provenance details share one inspector.
- **Not built:** agent avatars, chat bubbles, KPI tiles, a layers panel listing every dataset, a free-form canvas, a notification center, regenerate and thumbs buttons on findings.

## Building blocks

Per [ADR-0044](../decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md): shadcn components initialized on Base UI primitives (`--base base`), plus a few adapted MIT components with their notices kept.

| Surface | Base | Adapt or study |
|---|---|---|
| Director | shadcn Prompt Input and Suggestion patterns, `input-group`, `button`, `kbd` | AffectUI `thinking-loader-clean` (MIT, fed real step labels); Hairline `prompt-composer` (study) |
| Answer card, sources, citations | shadcn Sources and Inline Citation patterns; Base UI Popover (focusable) | Kokonut `ai-citations` and Hairline `citation` (MIT, adapt); AffectUI AI Answer and Cited Answer (Pro, study only) |
| Plan, task steps, trace lines | shadcn Plan, Task, Queue and Trace | Hairline `task-log` and `plan` (MIT, adapt); AffectUI `tool-call-card-clean` (MIT) |
| Views and mode switch | Base UI ToggleGroup or Tabs | AffectUI `segmented-control-clean` or Hairline `segmented-control` (MIT, no overshoot) |
| Timeline | Base UI Slider (`step` one month, `largeStep` 12, `getAriaValueText`), Observable Plot rows | App logic for months without data (no slider disables single values) |
| Inspector, trace sheet | Base UI Dialog and Drawer | None |
| Tables | shadcn Table (semantic) | TanStack Table only if sorting becomes a requirement |
| Toast | shadcn Toast or Sonner | One toast at a time |

Hover cards are not reachable by keyboard or screen readers: every citation chip is a button that opens a focusable popover or the inspector.

## Catalog bindings

One machine-readable entry per `componentKind` in `packages/contracts` is the single source for renderer registration, validation and the model-facing tool description. Entry fields: `kind`, `catalogVersion`, `proposable`, `modelDescription` (host-authored), `sections`, `binds` (record type, min, max, allowed statuses), `comparisonModes`, `maxPerSection`, `titleTemplate` (60 characters max), `textEquivalent` (table, list or text), `anchorRecordTypes`, `defaultFor` (task kinds), `motion` (MOT IDs). Limits are design proposals; change them only here.

| Kind | Component | Sections | Binds | Modes | Proposable | Default for task |
|---|---|---|---|---|---|---|
| `geography` | CMP-06 area card | place | GeoSelection 1 | none | yes | `plan` |
| `activity` | CMP-07 plan | place | Task 1 to 8 | none | no | `plan` |
| `temporal_comparison` | CMP-08 | observations, explanations | DataBundle 1 to 2 and GeoSelection 1 | single, aligned, two_period | yes | `observation_analysis` |
| `evidence` | CMP-09 | observations, explanations | Evidence 1 to 20 | none | yes | `source_research` |
| `hypothesis_comparison` | CMP-10 ledger | explanations | Hypothesis 1 to 5 | none | yes | `hypothesis_comparison` |
| `livelihood_constraints` | CMP-11 | responses | Evidence 1 to 20 | none | yes | `livelihood_governance` |
| `intervention_comparison` | CMP-12 | responses | Intervention 2 to 4 | none | yes | `intervention_feasibility` |
| `action_package` | CMP-13 field plan | next_steps | OperationalAction 1 to 3; ResourceRequirement 0 to 12 | none | yes | `brief_package` |
| `decision_brief` | CMP-14 | next_steps | Brief 1 | none | yes | `brief_package` |
| `trace` | CMP-16 | none (overlay) | none | none | no | none |

A component in `loading` binds the task IDs that will produce its records, so its pending slot shows the real task label ([PRES-02](data-contracts.md#presentation-contract)).

## Shared behavior

| Behavior | Rule |
|---|---|
| States | `loading` (pending slot with the real task label), `ready`, `partial` (what is missing, named), `error` (cause and retry), `stale` (dashed edge, "Inputs changed. Run again" control) |
| Provenance | Every statement shows its claim kind; every value opens the inspector. Statements without provenance are a validation failure, not a display state |
| Method line | Every legend and chart carries one line beneath it: dataset and version, period, reference or thresholds, source. Modeled values are labeled in place (VIS-20, VIS-21) |
| Honesty tag | At most one per graphic, written into its title line ("Vegetation and rainfall by month, illustrative values" in prototypes) |
| Mode | Components inherit the case mode; the mode label lives in the case pill |
| Accessibility | Each component is a labeled region with a heading; charts have a text summary and a table view; selection works with the keyboard; nothing is hover-only |
| Containers | No outer borders on non-interactive containers; a surface step and a faint ring separate them; spacing, not lines, separates rows |
| Size | Sheet width 480 px at 1440 (440 at 1280, 400 at 1024); inner grids collapse to one column below 400 px |

## CMP-01 Case pill

| | |
|---|---|
| Question | Which case is this, what is it doing, can I trust what I see? |
| Content | Mark, case title, status word ("Investigating"), running count as a separate element ("2 tasks running"), mode label; menu with Activity (opens trace), History, revision and save time, theme |
| Layout | Top left, 40 px tall, 16 px inset |
| States | Planning, Investigating, Needs your input (warning), Ready for review, Prepared (demo), Paused, Request failed (danger, names the request) |
| Accessibility | `banner` landmark; status changes announced politely, batched |
| Priority | P0 |

## CMP-02 Geo stage

| | |
|---|---|
| Question | Where is this, and what does the evidence look like on the ground? |
| Data | GeoSelection geometry and role; TemporalObservation map asset for the committed period; strata and rainfall grid when composed; context features for views |
| Layers (bottom to top) | Relief (one matte material under one low key light, [design system](design-system.md#cartography)), the Sentinel-2 summer imagery as the land's material (display only), contours, water and place labels, area outline with its role label, one data raster, excluded-area hatch, rainfall grid, strata, linked highlight |
| Rules | Full-bleed, one map instance, never resized during a transition; camera padding follows the islands. One data raster at a time. The story's oblique views paint measured layers on the relief at true cell size with the exaggeration written beside the view; the flat reading (MOT-12) is top-down with terrain off. Never a degradation color scale from vegetation alone |
| States | Tiles loading (previous view kept); no map asset for the period ("No map observation for this period"); WebGL unavailable (static relief image and the area as text) |
| Accessibility | Supplementary: every fact on the map is also in the sheet; the map region is labeled with area and period |
| Priority | P0: relief, imagery, contours, area, raster (the approved hero) |

## CMP-03 Timeline

| | |
|---|---|
| Question | Which periods have observations, and which period am I looking at? |
| Layout | Bottom of the map region. Collapsed: 40 px scrubber with a coverage track and the period label. Expanded on focus, and automatically when Observations or Explanations open at viewports 1360 px and wider: the three-row strip (availability, vegetation departure, rainfall departure once loaded), 96 px. Hidden while the map shows nothing period-dependent and under the review and history overlays |
| Encodings | Available month: solid cell. Below coverage policy: hatched and not selectable as an observation. No data: empty with a dotted outline. Departure rows use the diverging data palettes with a zero baseline |
| Interactions | Click or drag; arrows by month, Shift with arrows by year, Home and End; Escape cancels a drag; Play runs the time-lapse scene with Pause and Stop visible |
| Context markers (P1) | One marker row: national drought years from FAO GIEWS labeled "national" (published context), and the case's own commits (questions asked, findings committed) |
| Accessibility | Labeled slider with value text ("April 2022, 82% of area observed"); disabled months explain why on focus |
| References | VIS-09, VIS-13, VIS-16 |
| Priority | P0 |

## CMP-04 Investigation sheet and sections

| | |
|---|---|
| Question | What has Siterra established so far, in reading order? |
| Layout | Opaque sheet on the right, 12 px radius; the director attached to its bottom edge |
| Sections | Place, Observations, Explanations, Responses, Next steps (fixed order). Each header: title, one-line summary ("4 findings, 1 gap"), state, expand control |
| Behavior | Only the focused section is expanded; the others collapse to one line. A user command's result expands its section (MOT-08). Background work never collapses what the user opened. Wide content (intervention comparison, full brief) opens in the inspector overlay |
| Limits | Expanded components per the state's budget ([UX architecture](ux-architecture.md#visual-budget)) |
| Accessibility | `main` landmark; sections are `h2` regions; collapse is a disclosure button |
| Priority | P0 |

## CMP-05 Director

| | |
|---|---|
| Question | How do I direct Siterra, and what is it doing with my request? |
| Layout | A composer attached to the bottom of the sheet with the visible label "Ask Siterra" and no placeholder. Idle: one input and up to two suggestions written as user questions (including the answer's next questions), shown only when focused. On focus: context chips (Area, Period, Focus) that the server will receive. While running: a phase pill with the real current step and Stop. After completion: one receipt line with result links and Expand for history |
| Receipt | The user's words, the planner's one-sentence reading of the request, milestones from events ("Read 6 of 7 sources", "Loaded rainfall for 84 months"), then "Updated Explanations: ledger, rainfall comparison" |
| States | Sending, accepted, running (Stop), needs input (question with Answer and Continue without), done, partial (what was not done), failed (cause, Retry, input kept), stale ("The case changed while you were writing, so nothing was run. Your text is kept." with "Send on revision {n}") |
| Rules | Context chips are exactly what the server receives. External actions are never offered. Free-form model prose is never shown as a finding; findings live in components. Voice (P1 stretch) fills the same input with an editable transcript |
| Accessibility | Labeled input; milestones in a polite live region, batched; "/" focuses the input |
| Priority | P0 |

## CMP-06 Area card (`geography`)

| | |
|---|---|
| Question | What exactly is being analyzed, and what is it not? |
| Content | Role label, name, area in km² (computed), source and license, selection rationale, limitations ("Not a pasture, agdal or management boundary"), Show on map |
| Priority | P0 |

## CMP-07 Plan and activity (`activity`)

| | |
|---|---|
| Question | What is Siterra doing, and why? |
| Content | The planner's reading of the request; task rows grouped Needs you, Running and Done with counts; each row: icon, plain title, status words, one-line outcome, evidence IDs, duration when done; failed rows show the cause and Retry; "View in trace" per row |
| Collapsed form | One line in the sheet ("2 tasks running: reading rainfall records") |
| Rules | Rows appear on `task.queued`; status changes only from events; no percentages or invented progress; never model reasoning |
| Priority | P0 |

## CMP-08 Temporal comparison (`temporal_comparison`)

| | |
|---|---|
| Question | How has the measured quantity changed over time, and how complete is the record? |
| Single mode | Area median NDVI per month as points joined only within runs of valid months; the same-month reference median as a quiet line; spatial interquartile range as a band labeled "spatial spread, not uncertainty"; hatched gaps; the period cursor shared with the timeline |
| Aligned mode | Vegetation departure above, rainfall departure below, shared month axis, separate scales and units; antecedent window shading on demand. Never a dual axis |
| Chart rules | Observable Plot; 2 px lines, 8 px markers, hairline grid; fixed domains; label only the selected value; table view toggle |
| States | Partial (months missing), error (bundle failed validation), stale |
| Priority | P0 both modes |

## CMP-09 Evidence (`evidence`)

| | |
|---|---|
| Question | What do we know, of what kind, and from where? |
| Tile | Kind (glyph and words), ID, two-line statement, scope line (area role and period), provenance (source short title, or bundle and coverage) |
| Linked highlighting | Hover or focus lights the sentences that cite it, the tile and its spatial scope on the map |
| Grouping | Observations, then published context, then field requirements; within a group, the producing task's order |
| Interactions | Select (highlight on map and related records), open inspector, copy reference |
| Priority | P0 |

## CMP-10 Hypothesis ledger (`hypothesis_comparison`)

| | |
|---|---|
| Question | Which explanations fit the evidence, which do not, and what would decide? |
| Level 1 | One line per explanation: name, status words, counts written as text ("2 supporting, 0 contradicting, 1 missing") |
| Level 2 (expanded) | Analysis of competing hypotheses matrix: evidence rows by explanation columns; each cell a glyph plus word (supports, contradicts, not relevant, missing); hovering a column highlights its evidence on the map |
| Status words | Not yet tested; Consistent with available evidence; Contradicted by available evidence; Cannot be assessed with current data; Needs reassessment ([data contracts](data-contracts.md#hypothesis-status)) |
| Rules | No scores, probabilities or ranking by strength. Contradicting evidence is always shown. Several explanations can be consistent at once. Comparable places cannot change a status |
| Motion | MOT-05 (evidence moves into the ledger) |
| Priority | P0 |

## CMP-11 Livelihood constraints (`livelihood_constraints`)

| | |
|---|---|
| Question | Who depends on these pastures, how could responses affect them, and what is unknown locally? |
| Groups | Dependencies; who could bear costs; unknowns that need local information (dashed, "Not collected") |
| Rules | Published regional findings are labeled published context, never local estimates. No household counts, incomes or consent claims; official census figures only for the commune, never for the catchment |
| Priority | P0 |

## CMP-12 Intervention comparison (`intervention_comparison`)

| | |
|---|---|
| Question | What could be done, under what conditions, and who decides? |
| Layout | Opens in the inspector overlay. Columns: three to four options including "Defer until the field check". Rows: what it is, evidence basis, who decides, livelihood exposure, reversibility, field prerequisites, resources (with estimate status), what would rule it out, comparable places (P1) |
| Rules | No winner, score or forecast. Nothing reorders under the pointer. Below 640 px the table scrolls horizontally with row labels pinned |
| Priority | P0 |

## CMP-13 Field-validation plan (`action_package`)

| | |
|---|---|
| Question | What exactly should be measured next, where, by whom, and with what permissions? |
| Content | Objective and the decision it informs; strata drawn on the map; measurement table (what, method, season, stratum, role, the gap it resolves); permissions and consultation steps; resources by category with estimate status; dependencies; status Draft, Awaiting review, Prepared |
| Rules | Strata, not exact sampling points; the local team chooses sites. No send or schedule control exists |
| Priority | P0 |

## CMP-14 Decision brief and review (`decision_brief`)

| | |
|---|---|
| Question | What should I decide now, and what am I allowed to decide? |
| Brief | Known, Uncertain, Measure next, Involve (roles, not people), Siterra can prepare, Needs authorization, What happens next. Each line: text, claim kind, evidence chips. Exports light for print; French export is a labeled machine draft (P1) |
| Review queue | Role tabs (scientific, community and livelihood, program). The selected item: proposed action, one-line reason, evidence, uncertainty, effects, authority needed, alternatives, what each decision means and does not mean, remaining conditions. A pinned action bar with verbs that name their effect and keyboard shortcuts |
| Rules | Decisions bind to exact entity versions; stale decisions are disabled with "The case changed. Review revision N." naming the current revision. Demo labels persist in exports |
| Priority | P0; export P1 |

## CMP-15 Inspector

| | |
|---|---|
| Question | Where exactly did this come from? |
| Content | Evidence: statement, kind, scope, source locator and verified excerpt (original language kept), method and version, coverage, producing task with a trace link, relationships, review status. Measurement: value, unit, period, area, valid fraction, uncertainty kind, bundle, checksum, license and attribution. Method card for recipe results |
| Behavior | MOT-07; covers the sheet; Back returns to the same scroll position |
| Priority | P0 |

## CMP-16 Trace

| | |
|---|---|
| Question | What work did Siterra actually do, what did it cost, and what failed? |
| Layout | Bottom sheet (MOT-10). Left: command and task tree as one-line steps. Right: timing of model calls, tool calls, validations and commits. Detail: model ID, tokens, cost estimate, provider request ID, tool name, argument summary, result IDs, validation issues, retries |
| Quality and usage | Per command: proposals accepted on first pass, repaired and rejected, numeric provenance and prohibited-claim checks, total cost and time ([evaluation](evaluation.md)); which Meta model did each job |
| Rules | Only real events. No prompts, keys or hidden reasoning. Durations render at final length |
| Priority | P0 list view; P1 timing waterfall |

## CMP-17 Semantic connectors

| | |
|---|---|
| Question | How does this record relate to others? |
| Default | Linked highlighting and the relations list in the selected record's details |
| Drawn lines (P1) | One SVG overlay, at most six labeled lines, contradicting and authorization edges first, overflow listed (MOT-06) |
| Priority | P0 highlighting and list; P1 lines |

## CMP-18 Case history

| | |
|---|---|
| Question | What changed, and can I return to it? |
| Content | A change ledger: revision, time, command, what changed (before and after, old value struck through); opening a revision shows it read-only with a persistent banner and "Return to current case" |
| Priority | P0 revision and save time in the case pill; P1 ledger and read-only view |

## CMP-19 Map ornament and Views

| | |
|---|---|
| Question | How do I look at the place differently? |
| Content | Views menu (Views and Tours with title, one line, duration, binding summary, status; Overview doubles as reset), 3D toggle and zoom in one pill, top right |
| Transport bar | For tours: Play, Pause, Stop, previous and next step, step ticks and the caption line, above the timeline, or at the bottom of the map when the timeline is hidden (oblique views and orbits show no period-dependent layer) |
| Rules | A view the user picks overrides the default map until their next command; the legend says so. Scenes come only from templates ([scenes and views](scenes.md)) |
| Priority | P0 overview, obliques, time-lapse; P0 orbit if it holds 50 fps; P1 ridge, fly-through, strata tour, model-proposed scenes |

## CMP-20 Legend

| | |
|---|---|
| Question | What am I looking at on the map? |
| Content | Metric and period ("Vegetation departure from the April median, April 2022"), ramp with domain ticks and units, coverage line, missing and excluded swatches, method line, details control; "Your view" note when a user-picked view overrides the default |
| Layout | Bottom left, only while a data layer shows; collapses to a button below 1100 px |
| Priority | P0 |

## CMP-21 Answer card

| | |
|---|---|
| Question | What did Siterra find for my last request? |
| Content | The section question; a row of evidence tiles (previews; the inline chips are the interactive citations); a status line driven by task milestones; the finding with inline evidence chips; a quiet footer with revision and "Copy reference". Next questions appear as director suggestions, not in the card |
| Rules | Appears once validated, with one fade; no word-by-word streaming; no regenerate or thumbs controls |
| References | AffectUI AI Answer anatomy (studied), Perplexity answer layout |
| Priority | P0 |

## CMP-22 Comparable places

| | |
|---|---|
| Question | Where was something similar studied, and why might it not apply here? |
| Content | Cards in a fixed order (same massif first): place and scale, design label, period, finding with a verified excerpt, similarities and differences, transfer limits, what it cannot show; optional regional map view |
| Rules | [Comparable places](../explanation/comparable-places.md): published context only, no numeric transfer, cannot change a hypothesis status |
| Priority | P1 (P0 as corpus evidence only) |
