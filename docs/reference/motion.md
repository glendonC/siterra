# Motion

Tokens: [tokens.json](../../design/tokens/siterra.tokens.json) `motion`. References (VIS IDs) resolve in [design references](../explanation/design-references.md). The [prototype](../../design/prototype/index.html) demonstrates MOT-01 to MOT-05 and MOT-11 with simulated data; the [motion storyboard](../../design/motion/index.html) shows keyframes for MOT-01 to MOT-13. Scene behavior: [scenes and views](scenes.md#player-behavior).

## Rules that apply to every animation

1. Motion reports a state change the user needs to see. No ambient loops, particles, counting numbers or decorative parallax. The only repeating motion is the running-status dot, which stops under reduced motion. Views and tours (MOT-13) are not ambient: they start from the user's action, are finite, and always show Pause and Stop.
2. One focal transition runs at a time. A second focal transition queues until the first ends. Feedback-level motion (120 ms hover, press, toggle) is not focal.
3. Data never animates. Bars do not grow, lines do not draw on, values do not count up. Containers and positions animate; values appear in their final form.
4. Only real events start animation. Nothing animates on a model's partial output. Animation starts from committed records (`case.committed`, `layout.accepted`) or from the user's own input.
5. Nothing moves under the user's pointer or focus. If the pointer or keyboard focus is inside a region that would change, defer the change behind a "View new findings (n)" control.
6. The map canvas is never resized during a transition. The map stays full-bleed beneath the islands; the sheet, timeline and case pill change the camera `padding` instead. One `resize()` call only on real viewport change.
7. Every animation can be interrupted. Any input completes or cancels the running animation within 100 ms. Map camera animations stop on drag, wheel or keyboard pan.
8. Under reduced motion (`prefers-reduced-motion: reduce`): no camera flights, translations, shared-element travel or path drawing. Use instant state changes, at most a 120 ms opacity change, and keep the textual announcement.
9. For performance: animate `transform` and `opacity` only; at most about 24 animated nodes at once; Motion layout animations only inside the investigation sheet; never wrap the map in a layout-animated element.

Duration tokens: feedback 120 ms, reveal 220 ms, panel 280 ms, compose 360 ms, short camera 900 ms, arrival 2400 to 3000 ms. Standard easing `cubic-bezier(0.22, 1, 0.36, 1)`; exits `cubic-bezier(0.4, 0, 1, 1)`.

Implementation notes (from the [generative workspace research](../../research/technology/generative-workspace.md#5-layout-motion-webgl-and-view-transitions)):

- Wrap the sheet in one `LayoutGroup`; put `layoutScroll` on its scroll container; use `layout="position"` on sections and chart containers so chart text is never scaled and charts render once at final width.
- For MOT-05, give the shared `layoutId` (the evidence ID) only to the first ledger cell where an evidence item appears; other appearances fade in place.
- Set `MotionConfig reducedMotion="user"` and also zero opacity durations above 120 ms when `useReducedMotion()` is true, because Motion's setting removes transforms only.
- MapLibre `easeTo` and `flyTo` skip animation under reduced motion unless `essential: true`; never set `essential: true`.
- No View Transitions API in P0: root capture suspends hit testing (breaking map gestures), concurrent commits abort transitions, and one image per boundary cannot express MOT-05. Revisit for route-level revision views with the map excluded.

## Catalog

| ID | Name | Priority |
|---|---|---|
| MOT-01 | Arrival settle (geographic fly-in) | P1 (P0 is a static well-framed view) |
| MOT-02 | Commission composition (the stage makes room) | P0 |
| MOT-03 | Component arrival (streamed creation) | P0 |
| MOT-04 | Period swap (temporal map transition) | P0 |
| MOT-05 | Evidence re-sort into the hypothesis ledger (signature) | P0 simple, P1 shared-element travel |
| MOT-06 | Connector reveal (semantic relationships) | P1 |
| MOT-07 | Inspector expansion (contextual panel) | P0 |
| MOT-08 | Focus transition (attention to a result) | P0 |
| MOT-09 | Comparison transition (single chart to aligned panels) | P0 |
| MOT-10 | Trace sheet | P0 |
| MOT-11 | Decision brief composition | P0 simple, P1 chip travel |
| MOT-12 | Camera mode change (orientation to measurement) | P0 |
| MOT-13 | Scene playback (views and tours) | P0 views and time-lapse; P0 orbit if it holds 50 fps; P1 other tours |

### MOT-01 Arrival settle

| | |
|---|---|
| Trigger | First visit to a case with no saved camera, after the start view's tiles report idle |
| Initial → final | Regional view (zoom about 9.4, pitch 25°, bearing 0) → valley view (zoom about 11.8, pitch 55°, bearing chosen so the valley reads left to right, terrain exaggeration 1.2) |
| Elements | Map camera only; the case card reveals after `moveend` (220 ms fade and 8 px rise) |
| Duration and easing | 2400 to 3000 ms, `flyTo` with a low curve (about 1.2) so the zoom-out arc is shallow; no bearing change in the final 20% |
| Interruption | Any gesture stops the camera (map default); the card appears immediately |
| Reduced motion | `jumpTo` the final view; leave `essential` unset (it defaults to false) so the library's own reduced-motion handling also applies |
| Performance | Single DEM source; preload by starting at the regional view; skip on reload (restore the saved camera) |
| Rationale | Establishes where the valley sits in the range and its relief in one move, once. References: VIS-04 and VIS-05 (map camera APIs and terrain examples) |

### MOT-02 Commission composition

| | |
|---|---|
| Trigger | `command.accepted` for the commission (server acknowledgement, not the click) |
| Initial → final | Full-bleed map with the case card → the investigation sheet on the right with Place expanded and the director attached; the case card title and question become the Place header (shared element) |
| Elements | Sheet `translateX(100% → 0)`; case card to Place header (`layoutId`); camera `easeTo` with `padding.right = sheet width + inset`, `padding.bottom = timeline height` |
| Duration and easing | Sheet 360 ms standard; camera 900 ms in the same moment (this is one composite focal transition) |
| Interruption | Map gesture cancels the camera; the sheet always completes |
| Reduced motion | The sheet appears with a 120 ms fade; camera `jumpTo` with the same padding and pitch |
| Rationale | Shows the change from "a case" to "an investigation in progress" while keeping the place on screen |

### MOT-03 Component arrival

| | |
|---|---|
| Trigger | A commit that adds or replaces a component |
| Initial → final | If the task was announced, a 48 px pending slot with the task label and running status → the component at natural height |
| Elements | Slot height (layout animation 280 ms); component opacity 0 → 1 and `translateY(8px → 0)` 220 ms; items in one commit stagger 40 ms (max six staggered, the rest together) |
| Sync | Map layer and timeline row additions follow 80 ms after the component |
| Interruption | Rule 5: if the pointer or focus is inside the section, show "View new findings (n)" and apply on click or when the pointer leaves |
| Reduced motion | Opacity only, 120 ms |
| Rationale | Work arrives as discrete, attributable results tied to real commits |

### MOT-04 Period swap

| | |
|---|---|
| Trigger | Committed period change: click, key, or drag end (during drag only the label previews) |
| Elements | Timeline cursor, chart cursor and legend title update instantly; the map raster crossfades |
| Duration | 160 ms crossfade, started only after the new raster has loaded. If loading exceeds 150 ms the legend reads "Loading Apr 2022" while the old raster stays labeled with its own period |
| Implementation | Two raster sources (current and incoming) with `raster-opacity` transitions; request tokens so the latest selection wins; neighbors prefetched |
| Reduced motion | Instant swap |
| Rationale | Smooth without implying interpolation; a raster is never shown under the wrong period |

### MOT-05 Evidence re-sort into the hypothesis ledger (signature)

| | |
|---|---|
| Trigger | Commit of a hypothesis comparison caused by the user's challenge |
| Sequence | 1) Explanations section expands (280 ms). 2) Hypothesis rows enter (220 ms, 60 ms stagger). 3) Evidence chips travel from their positions in Observations to the ledger line of the explanation they bear on, and that line's counts update as each chip lands (level 1); with the evidence matrix expanded they land in their matrix cells (level 2). 360 ms, 60 ms stagger, at most eight; chips whose source is off-screen fade in place. 4) Status words fade in (120 ms). Chips start travelling once the first row has settled, so the steps overlap and the sequence ends by about 1.2 s (cap 1.4 s) |
| Elements | Evidence chips share `layoutId` = evidence ID across the list and the ledger; rows use layout animation |
| Sync | Rainfall grid outline on the map and the timeline's rainfall row appear after step 4 |
| Interruption | Click, key or scroll jumps to the final state |
| Reduced motion | Final state immediately; changed lines or cells get one 200 ms background highlight |
| Rationale | The same evidence visibly serves competing explanations. Movement encodes meaning: where a fact sits in the argument |

### MOT-06 Connector reveal

| | |
|---|---|
| Trigger | Selecting a record with relationships |
| Final | Up to six labeled connectors (rules in [Data contracts](data-contracts.md#semantic-relationships)); unrelated content dims to 60% opacity |
| Duration | Path draw 220 ms (`stroke-dashoffset`), label fade 120 ms, dim 120 ms |
| Off-screen targets | Edge indicator ("2 related above") instead of a long line |
| Reduced motion | Lines appear without drawing |
| Rationale | Relationships appear when asked, so the workspace never becomes a tangled graph |

### MOT-07 Inspector expansion

| | |
|---|---|
| Trigger | Open an evidence, source or measurement inspector |
| Final | Inspector covering the investigation sheet at the same width, title and kind in its header, Back control |
| Duration | Open 220 ms (24 px slide and fade); close 180 ms with exit easing |
| Focus | Moves to the inspector heading; Escape closes and returns focus to the invoking control |
| Reduced motion | Fade only |

### MOT-08 Focus transition

| | |
|---|---|
| Trigger | The user activates a result link, or the user's own command completes |
| Behavior | Scroll the target into view (360 ms); 2 px focus edge on the target fading after 1.2 s; the map camera moves only if the user asked to show it on the map |
| Never | Triggered by background work |
| Reduced motion | Instant scroll; static edge for 1.2 s |

### MOT-09 Comparison transition

| | |
|---|---|
| Trigger | A comparison request (vegetation versus rainfall, or two periods) |
| Behavior | The existing chart keeps its position, x-scale and y-scale; the new panel grows beneath it (280 ms) sharing the x-axis; the x-axis labels move to the bottom panel |
| Rationale | Orientation is preserved: what the user already read stays put; new information arrives aligned |
| Reduced motion | The new panel appears without growth; the existing chart does not move |
| Scope | Applies when an expanded chart switches mode in place (`set_comparison`). When the comparison arrives as a new component in another section (scene 5), it enters with MOT-03 and its upper panel repeats the vegetation series at the same scale as the original chart |

### MOT-10 Trace sheet

| | |
|---|---|
| Trigger | Open activity or trace |
| Behavior | Bottom sheet over the map region, 45% of viewport height, 280 ms; the selected task expands; duration bars render at final length (durations are data) |
| Reduced motion | 120 ms fade |

### MOT-11 Decision brief composition

| | |
|---|---|
| Trigger | Brief commit |
| Behavior | Sections reveal in reading order (Known, Uncertain, Measure next, Involve, Siterra can prepare, Needs authorization, What happens next), 220 ms each, 80 ms stagger; each line shows its evidence chips (P1: chips travel from visible components as in MOT-05) |
| Rationale | The brief is visibly assembled from prior evidence |
| Reduced motion | All sections appear at once, no stagger, one polite announcement |

### MOT-12 Camera mode change

| | |
|---|---|
| Trigger | Entering a measurement view (Observations focused, a period selected, comparison) sets pitch 0; returning to Place restores the default oblique (pitch 55°). Views and tours use the scene limits ([scenes and views](scenes.md#geometry-and-readability-limits)) |
| Duration | 900 ms `easeTo`; never during a user gesture |
| Rationale | Perspective aids orientation but distorts area and pattern; measurement views are top-down. In measurement views 3D terrain is switched off as well as pitched to 0: in the prototype, terrain displacement at pitch 0 visibly skewed the rainfall grid against the raster |
| Reduced motion | `jumpTo` the new pitch |

### MOT-13 Scene playback

| | |
|---|---|
| Trigger | The user picks a view or tour from the Views menu or presses Play on the timeline; in P1, an accepted scene from the user's own command plays once. Background commits never start or change a scene |
| View | One camera move to the computed still: `easeTo` 900 ms for nearby views, `flyTo` up to 2400 ms for large changes; layers switch in the same state update; caption fades in over 220 ms after `moveend` |
| Tour | Steps from the template, each a cut, ease or fly of 300 to 3000 ms followed by a hold; the time-lapse swaps periods with MOT-04 crossfades and never interpolates imagery; the transport bar enters over 220 ms above the timeline, or at the bottom of the map when the timeline is hidden |
| Interruption | Any map gesture, wheel, key or pointer down pauses within one frame; Resume eases back to the scene; Stop restores the camera, layers and period from before the scene |
| Reduced motion | Views jump to the still; tours become stills stepped with Next and Previous; captions are announced politely |
| Performance | Wait for the map to be idle at the first camera and warm the terrain tile cache before playing; orbit and fly-through ship only if they hold 50 fps on the demo laptop (PF-04), otherwise they become stills |
| Rationale | Several angles explain relief and layout faster than one view, and a finite, user-started tour keeps attention on the place rather than on the motion |
