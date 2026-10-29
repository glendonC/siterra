# Scenes and views

How Siterra shows the same place from different angles, plays time over it, and lets the AI choose and bind reusable map scenes without writing code. Evidence, MapLibre capabilities and the arithmetic behind each template are in the [map scenes research](../../research/technology/map-scenes.md). Decision: ADR-0035.

## The hero sequence (design language 1.3)

The first thing anyone sees: an opening page, a globe, a dive, then six beats in the valley, in daylight. The founder approved it on 27 Oct 2026. Timings are in [motion](motion.md#the-hero-timeline-design-language-13), strings with their IDs in [microcopy](microcopy.md) (sections 1 and 1a), parts in [components](components.md#hero-components-design-language-13), colours in the [design system](design-system.md). The language in one line: a lit instrument over real land. The terrain runs to every edge into haze, the catchment is the selected district because one low warm light falls on it, and what has to be read sits on one card that reaches the land by one leader.

### Opening page

On paper, outside the product chrome. One beat at a time, centred, at 48 CSS px on the 1440-wide layout in a column of about 38 characters: the claim in ink, its qualifier in grey, the source tag in mono beneath. A row of four thin marks at the top says which beat is showing. Under the type, a large limb of the globe fills about the lower 40 per cent of the frame. The rangeland biomes are lit on it from beat 1 (biome land takes the warm light, other land takes paper haze). The limb rises a few pixels with each beat and to about half the frame after beat 4, when the single action appears. Credits sit on a paper backing.

### Globe

A dot globe on paper. Dots lie on a regular lattice, each sized by the GLO-90 elevation of its own cell; land dots are ink-grey, sea dots faint. The rangeland biomes stay lit. North Africa turns to the centre. One case is marked: a thin ring in the accent and a small warm point at the valley's outlet. "Atlas Mountains, Morocco" is set along the range, north of the case. Around the globe: "One case so far: Aït Bouguemez", the biome legend, the key hints and the credit line, each on paper so no text sits on dots. No idle spin; drag turns within limits; Enter or a click on the case dives.

### Dive

4.4 s from the globe to the valley's arrival camera, one continuous camera:

1. The camera falls toward the case on a logarithmic altitude curve, top-down. The dots grow denser where it looks.
2. The dots resolve into contour lines drawn outward from the case, generalized to the scale of the view.
3. The relief rises out of the flat contours to the valley's exaggeration (2.0).
4. The camera tilts from top-down to the arrival pose while the catchment line draws round the valley from the outlet.
5. The Sentinel-2 summer imagery becomes the land's material, and land beyond 52 km of the catchment fades to paper.

The names narrow from "Atlas Mountains, Morocco" to "High Atlas Mountains" to "Aït Bouguemez valley". The case ring stays the anchor and leaves before the join, where the valley's outlet takes over. Land runs to every edge through the whole dive: the valley's relief block blends into the globe around it and never shows as a tile.

The dive ends on the valley's first frame (the join): the same camera, land, catchment line and credit line, no labels, the light not yet warmed. The valley sequence owns its arrival camera pose; the dive reads it and ends exactly on it.

### Valley sequence

Six beats on one clock, one card at a time on the right third, one leader to the land, the camera still while anything is read:

| Beat | On the land | On the card and below |
|---|---|---|
| Arrival | The light warms inside the catchment line while the land outside takes paper haze; the valley name on the ground; the outlet beam with "Outlet: the whole catchment drains here"; Tabant and Aït Ouchi on thin stems; "Valley catchment: 417.0 km²" with its honesty line | The founder's question in the command line; the key hint to start |
| Work | Two measured layers lift as thin sheets cut to the catchment outline, each labelled by the question it answers, and come down onto the land as their step runs; a measurement front crosses the catchment | "Planning: 4 steps to answer this question"; each step runs, then reports in past tense with its count and period |
| Evidence | One located study on a stem in the accent at Aït Ouchi; the April gaps hatched on the ground with their reason | The study's statement, source and Meaning line; the five national reports as an open ring on the card, never placed on the valley |
| Dry-year challenge | Rainfall per cell painted at true cell size on the relief in three display classes, 2021/22 then 2022/23; beside the catchment, one stem per wet season from 1991/92 to 2022/23 around the 1991 to 2020 mean, with the near-normal band as a slab and the season on show as the one warm stem | The viewer's question branches from the case question; "Simulated answer."; the 2021/22 statement, then after the swap the statement with both seasons' totals; source and Meaning line |
| Verdict | Only the evidence the verdict rests on; every gap hatch | A large two-tone statement in the paper sky with "Simulated answer."; the figure card with its source, method and Meaning line, the April flags and the Why chip |
| Field plan | The three elevation bands as tints of the shadow colour, their limits as thin contour lines, each named on the ground; mapped cropland and buildings marked as not sampled | The proposal in two tones, "To measure:" and "Proposal only. Nothing has been arranged with the villages." |

The story's views are oblique, and measured layers are painted on the relief at their true cell size with "Relief ×2" beside the view. "F Read flat", in every beat, is the flat reading of what the beat shows: the camera moves top-down and north up with terrain off, graticule ticks at the frame edges and a scale bar, so areas and patterns can be read ([MOT-12](motion.md#mot-12-camera-mode-change)); F again returns to the beat's view. The approved frames do not show the flat reading.

## Terms

| Term | Meaning |
|---|---|
| Scene | A sequence of full map states (camera, layers, annotations, period, caption). Produced from a template, never authored as code. |
| View | A one-step scene: a still from a computed angle. The UI calls these "Views". |
| Tour | A multi-step scene, such as an orbit or a time-lapse. Played with a transport bar. |
| Scene template | Reviewed TypeScript code with an integer version. Declares roles it needs (area, period set, path, viewpoint, evidence), bounded parameters, and availability rules. Case-agnostic. |

Templates bind to any case's records, so a new case gets its own overview, obliques, orbit and time-lapse without anything being rebuilt.

## Pipeline

1. Instantiate: After each commit, a pure function derives the default scene set from the case snapshot and the template availability rules (area ready: overview and obliques; observations available: time-lapse).
2. Validate: Schema, role bindings (type, status, current revision), parameter bounds, geometry limits after resolving, compiled style (MapLibre `validateStyleMin`), text rules, and size limits. A rejected scene never fails its task; the default set stays.
3. Resolve: Geometry turns into fixed numbers: camera keyframes, recipe instances, annotations, captions.
4. Play: `evaluate(scene, tMs)` returns the full frame state as a pure function. A live driver applies diffs to the map and app state in one update; a step driver serves reduced motion.

The model never writes style JSON, expressions, easing functions, coordinates, URLs, markup or code.

## Camera primitives

| Primitive | What it does | Reduced motion |
|---|---|---|
| `fit` | Frames an area or feature set at a bearing rule (north, across the valley axis, upstream, downstream, facing a slope) and pitch 0 to 60 | Same still |
| `look_from` | Camera at a viewpoint above terrain looking at a target, with pitch clamped and the eye raised if needed | Same still |
| `orbit` | Finite rotation around a target (sweep 30 to 360 degrees, 2 to 8 degrees per second, eased ends); never loops | Three stills |
| `fly_along` | Camera follows a line record (for example a river main stem) with smoothing and yaw limits | Four to six stills |
| `period_sequence` | Steps through periods (same month each year, all available, or a list), holding each; gaps shown as gaps | Manual next |
| `hold` | Holds the current state | Same |

Step transitions: cut, ease or fly, 300 to 3,000 ms, easing tokens from the [motion reference](motion.md).

## Layer recipes

Coded functions that emit MapLibre layers over bundle sources: `area_outline`, `context_dim`, `period_raster` (crossfade only, never interpolated), `rainfall_grid`, `strata`, `path_line` (reveal synced to a fly-through), `evidence_marker` (at most one finite pulse), `terrain_relief` (exaggeration 2.0, as in the hero, set per step; it rises from flat ground only once, in the dive), and `imagery_drape` (P0 with the hero: the Sentinel-2 summer 2025 composite precomputed by the pipeline is the land's material in every valley view, display only, under the painted measured layers; captioned "Imagery: Sentinel-2, summer 2025, display only", with the Copernicus notice in the credit line). Recipes read runtime values through MapLibre global state, so a binding change is a state update, not a style edit.

## Annotations

Labels from record fields, callouts that quote an evidence statement with its ID chip (open the inspector), captions from template strings with slots filled from records, and fixed honesty notes ("Relief ×2", "Imagery: Sentinel-2, summer 2025, display only", "Oblique view: not for reading area or pattern", "Preview boundary"). No free text from the model.

## Templates

Example resolutions for the Aït Bouguemez catchment are computed in the research note (for example the valley axis at about 57 degrees and an across-valley bearing of 146.6 or 326.6 degrees).

| Template | Kind | Binds | Priority |
|---|---|---|---|
| `overview_2d` | View | Area | P0 |
| `valley_oblique` (facing across or along the valley axis) | View | Area, outlet | P0 (two stills), P1 (four) |
| `orbit_area` | Tour | Area | P0 if it holds 50 fps on the demo laptop (PF-04), otherwise stills |
| `period_timelapse` | Tour, driven by the timeline play button | Temporal observations | P0 |
| `answer_focus` | View | The records a committed answer binds (for example hypotheses, their evidence and the rainfall grid) | P0 as a deterministic default per answer type; P1 when the model chooses it |
| `ridge_view` | View | Area, viewpoint record | P1 |
| `river_flythrough` | Tour | Area, main-stem line record | P1 |
| `strata_tour` | Tour | Strata records | P1 |

Viewpoint and path roles need a context feature record (point or line with provenance and attribution, for example a DEM-derived main stem or an OpenStreetMap summit), planned for a later contracts version; it is not part of contracts 1.3.0 ([data contracts](data-contracts.md)).

## The model's role

- **P0:** none. Each answer type maps to a default scene, so the camera goes where the evidence is without a model call.
- **P1:** `propose_scene` in the commit that completes the user's own command when it asks to show something ("show the valley from the north ridge", "play April across the years"). The model picks one template, binds record IDs and sets bounded parameters. Accepted scenes may play once; background proposals never auto-play.
- **Later:** the model composes steps from the same primitives and recipes under the same validator; good compositions become templates through review. User-saved views are stored as fixed stills.

## Geometry and readability limits

Camera at least 300 m above the terrain maximum along its path; pitch at most 75 for tours and 80 for stills; yaw at most 8 degrees per second; zoom 9 to 13.5; center inside the display extent; in the investigation workspace and in the flat reading, steps that show `period_raster` or `rainfall_grid` are top-down with terrain off ([MOT-12](motion.md#mot-12-camera-mode-change)); the hero's story views paint them on the oblique relief at true cell size with "Relief ×2" beside the view, and the flat reading is one key away. Tours: at most 12 steps and 45 seconds, no loops, Pause and Stop always visible (WCAG 2.2.2).

## Player behavior

- Any map gesture, wheel, key or pointer down pauses within one frame; Resume eases back; Stop restores the camera, layers and period from before the scene.
- Background commits never change a playing scene; they wait behind "View new findings (n)".
- Reduced motion turns tours into stills stepped manually; captions are announced politely; `essential` is never set.
- Before playing, wait for the map to be idle at the first camera and warm the terrain tile cache.

## Views menu

A "Views" button next to zoom, reset and 2D/3D. Two groups: Views and Tours. Each item shows its title, one line on what it shows, duration for tours, what it binds ("April 2019 to 2025, 6 of 7 observed"), and status (Ready, Unavailable with the reason, Stale). Tours open a transport bar above the timeline with Play, Pause, Stop, previous and next step, and the caption line. Every fact a scene shows is also available in the case panels; the map is supplementary.

## Export

Screen recording of the live app is the demo method because it keeps the mode badge in every frame. Frame-exact export (MapLibre `setNow` with a video encoder) captures only the map canvas and is a later option.
